"""
Centralized Application Insights Logger for Backend APIs

Usage:
    from shared.appinsights_logger import get_logger, log_performance, log_database_query, log_external_call

    logger = get_logger(__name__)
    logger.info("Something happened", extra={"custom_key": "value"})

    @app.route("/endpoint", methods=["POST"])
    @log_performance()
    def my_endpoint():
        ...
"""

import logging
import time
import functools
import traceback as tb

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from opentelemetry.sdk._logs import LoggingHandler, LoggerProvider
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource
from azure.monitor.opentelemetry.exporter import AzureMonitorLogExporter

try:
    from flask import has_request_context, request as flask_request, g as flask_g
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False
    has_request_context = lambda: False
    flask_request = None
    flask_g = None

# ─── Configuration ────────────────────────────────────────────────────────────

ENVIRONMENT = ""
ENVIRONMENT = ENVIRONMENT or "development"
SERVICE_NAME = "iTelemetry-Backend"
_initialized = False
_logger_provider = None
_CONNECTION_STRING = None

EXCLUDED_LOGGERS = [
    "werkzeug", "urllib3", "azure", "opentelemetry",
    "msal", "uamqp", "requests", "chardet", "charset_normalizer",
]


# ─── Initialization ──────────────────────────────────────────────────────────

def initialize_azure_monitor():
    """Call once at app startup. Safe to call multiple times."""
    global _initialized, _logger_provider, _CONNECTION_STRING
    if _initialized:
        return

    try:
        from shared.keyVault import connectToKeyVault
        _CONNECTION_STRING = connectToKeyVault("itelemetry-appinsights-connectionString")
    except Exception as e:
        print(f"[Logger] KeyVault failed: {e}")

    if _CONNECTION_STRING:
        try:
            resource = Resource.create({
                "service.name": SERVICE_NAME,
                "service.namespace": "iTelemetry",
                "deployment.environment": ENVIRONMENT,
            })
            _logger_provider = LoggerProvider(resource=resource)
            _logger_provider.add_log_record_processor(
                BatchLogRecordProcessor(AzureMonitorLogExporter(connection_string=_CONNECTION_STRING))
            )
            print(f"[Logger] Azure Monitor initialized ({ENVIRONMENT})")
        except Exception as e:
            print(f"[Logger] Azure Monitor init failed: {e}")
    else:
        print("[Logger] No connection string — console logging only")

    _initialized = True


# ─── Logger Factory ──────────────────────────────────────────────────────────

class _FuncNameFilter(logging.Filter):
    """Patches record.funcName so OTel sees the real function, not 'wrapper'."""
    def filter(self, record):
        fn = getattr(record, "function_name", None)
        if fn:
            record.funcName = fn
        return True


def get_logger(name: str) -> logging.Logger:
    """Get a configured logger. Safe to call repeatedly — configures only once."""
    if not _initialized:
        initialize_azure_monitor()

    logger = logging.getLogger(name)

    if getattr(logger, "_configured", False):
        return logger
    logger._configured = True

    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addFilter(_FuncNameFilter())

    # Console handler
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(funcName)s | %(message)s"
    ))
    logger.addHandler(handler)

    # App Insights handler (skip noisy libraries)
    is_excluded = any(name.lower().startswith(ex) for ex in EXCLUDED_LOGGERS)
    if _logger_provider and not is_excluded:
        logger.addHandler(LoggingHandler(logger_provider=_logger_provider))

    return logger


# ─── Correlation ─────────────────────────────────────────────────────────────

def _extract_correlation() -> dict:
    """Pull correlation IDs from Flask request headers."""
    if not (FLASK_AVAILABLE and has_request_context()):
        return {"session_id": "", "user_id": "", "user_name": "", "trace_id": "", "span_id": ""}

    h = {k.lower(): v for k, v in flask_request.headers}
    ctx = {
        "session_id": h.get("x-session-id", ""),
        "user_id": h.get("x-user-id", ""),
        "user_name": h.get("x-user-name", ""),
        "trace_id": "",
        "span_id": "",
    }
    tp = h.get("traceparent", "")
    if tp:
        parts = tp.split("-")
        if len(parts) >= 3:
            ctx["trace_id"], ctx["span_id"] = parts[1], parts[2]
    return ctx


def get_correlation_context() -> dict:
    """Get cached correlation context for the current request."""
    if FLASK_AVAILABLE and has_request_context():
        try:
            return flask_g._corr_ctx
        except AttributeError:
            pass
    return _extract_correlation()


# ─── Status Code Detection ──────────────────────────────────────────────────

def _status_code(result) -> int:
    """Extract HTTP status from Flask return values."""
    if isinstance(result, tuple) and len(result) >= 2 and isinstance(result[1], int):
        return result[1]
    if isinstance(result, dict) and isinstance(result.get("status"), int):
        return result["status"]
    # Flask Response (e.g. jsonify({"status": 500, ...})) — read the JSON body's status
    body = _response_body(result)
    if isinstance(body, dict) and isinstance(body.get("status"), int):
        return body["status"]
    return 200


def _response_body(result):
    """Best-effort JSON body from a Flask Response; None for non-Response values."""
    try:
        if hasattr(result, "get_json"):
            return result.get_json(silent=True)
    except Exception:
        return None
    return None


def _error_detail(result) -> str:
    """Pull a short error message from an error response body."""
    payload = result if isinstance(result, dict) else _response_body(result)
    if isinstance(payload, tuple) and payload and isinstance(payload[0], dict):
        payload = payload[0]
    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, dict):
            msg = err.get("message", "")
            det = err.get("detail")
            return (f"{msg}: {det}" if det else str(msg))[:2000]
        data = payload.get("Data", payload)
        return str(data)[:2000]
    return str(result)[:2000]


# ─── Unified Log Schema ──────────────────────────────────────────────────────
# Every log record (api_request / api_response / database_query / external_call,
# success or failure) emits the SAME set of custom dimensions. This lets audit
# reports pull one consistent shape and build visuals without special-casing
# each event type. Missing values default to "" / None so the columns always
# exist in App Insights (customDimensions).

LOG_SCHEMA_VERSION = "1.0"

_DIMENSION_KEYS = (
    "schema_version", "event_type", "environment",
    "service_name", "operation", "function_name", "endpoint", "method",
    "status_code", "success", "duration_ms", "row_count",
    "exception_type", "exception_message", "exception_trace",
    "session_id", "user_id", "user_name", "trace_id", "span_id",
)


def _dimensions(**overrides) -> dict:
    """Build the canonical custom-dimensions dict shared by every log record."""
    d = {k: "" for k in _DIMENSION_KEYS}
    # numeric / boolean fields default to None (absent), not empty string
    d["status_code"] = None
    d["success"] = None
    d["duration_ms"] = None
    d["row_count"] = None
    d["schema_version"] = LOG_SCHEMA_VERSION
    d["environment"] = ENVIRONMENT
    d.update(get_correlation_context())
    d.update(overrides)
    return d


# ─── Standard Error Envelope ─────────────────────────────────────────────────
# Every API error/exception is returned to the client in ONE shape:
#
#   {
#     "status": 500,
#     "error": {
#       "type": "OperationalError",       # exception class or short code
#       "message": "Human-readable summary",
#       "detail": "optional longer info / validation text",
#       "trace_id": "<correlation id>",
#       "timestamp": "2026-07-21T10:15:05Z"
#     },
#     "Data": null                         # kept for shape-compatibility
#   }
#
# The full stack trace is NEVER sent to the client; it is only logged to
# App Insights. `error_response` also stashes the exception details on
# flask.g so @log_performance can log the real type + trace for this request.

ERROR_SCHEMA_VERSION = "1.0"


def error_response(status: int, message: str, detail=None, exc: Exception = None):
    """
    Build the standard error envelope and return a (body, status) tuple.

        return error_response(500, "Failed to fetch servers", detail=info, exc=ex)

    - status : HTTP status code (also placed in the body for legacy checks).
    - message: short human-readable summary shown to the user.
    - detail : optional extra context (validation text, exceptioninfo dict, etc.).
    - exc    : optional caught exception; its type + traceback are logged (not returned).
    """
    corr = get_correlation_context()
    err_type = type(exc).__name__ if exc is not None else "Error"
    body = {
        "status": status,
        "error": {
            "type": err_type,
            "message": str(message),
            "detail": None if detail is None else str(detail)[:2000],
            "trace_id": corr.get("trace_id", ""),
            "timestamp": _utc_now_iso(),
        },
        "Data": None,
    }

    # Stash real exception details for @log_performance to attach to this request's
    # api_response error log (so the log keeps the true type + full stack trace).
    if FLASK_AVAILABLE and has_request_context():
        try:
            flask_g._error_info = {
                "exception_type": err_type,
                "exception_message": str(message) if detail is None else f"{message}: {str(detail)[:1000]}",
                "exception_trace": tb.format_exc() if exc is not None else "",
            }
        except Exception:
            pass

    return body, status


def _utc_now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ─── @log_performance Decorator ─────────────────────────────────────────────

def log_performance(logger: logging.Logger = None):
    """
    Logs 1 request + 1 response per call, with correlation, timing, and status.
    Catches unhandled exceptions, logs them, and re-raises.
    """
    def decorator(func):
        _log = logger or get_logger(func.__module__)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            ctx = _extract_correlation()
            if FLASK_AVAILABLE and has_request_context():
                flask_g._corr_ctx = ctx

            endpoint = (flask_request.url if FLASK_AVAILABLE and has_request_context() else func.__name__)
            method = (flask_request.method if FLASK_AVAILABLE and has_request_context() else "CALL")
            fn = func.__name__

            _log.info(f"API Request: {method} {endpoint}",
                      extra=_dimensions(event_type="api_request", function_name=fn,
                                        method=method, endpoint=endpoint))

            tracer = trace.get_tracer(__name__)
            t0 = time.time()

            try:
                with tracer.start_as_current_span(fn) as span:
                    span.set_attribute("environment", ENVIRONMENT)
                    span.set_attribute("function_name", fn)
                    result = func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))

                ms = (time.time() - t0) * 1000
                code = _status_code(result)
                if code >= 400:
                    # Logging: a >=400 status is treated as an application error.
                    # If error_response() stashed the real exception on flask.g,
                    # use its true type + stack trace; otherwise fall back to the
                    # response body detail.
                    einfo = None
                    if FLASK_AVAILABLE and has_request_context():
                        einfo = getattr(flask_g, "_error_info", None)
                    if einfo:
                        exc_type = einfo.get("exception_type") or "HandledError"
                        exc_msg = einfo.get("exception_message") or _error_detail(result)
                        exc_trace = einfo.get("exception_trace") or ""
                    else:
                        exc_type = "HandledError"
                        exc_msg = _error_detail(result)
                        exc_trace = ""
                    _log.error(
                        f"API Response: {endpoint} | {code} | {ms:.0f}ms | {exc_msg}",
                        extra=_dimensions(event_type="api_response", function_name=fn,
                                          method=method, endpoint=endpoint,
                                          status_code=code, success=False, duration_ms=ms,
                                          exception_type=exc_type,
                                          exception_message=exc_msg,
                                          exception_trace=exc_trace))
                else:
                    _log.info(f"API Response: {endpoint} | {code} | {ms:.0f}ms",
                              extra=_dimensions(event_type="api_response", function_name=fn,
                                                method=method, endpoint=endpoint,
                                                status_code=code, success=True, duration_ms=ms))
                return result

            except Exception as e:
                ms = (time.time() - t0) * 1000
                _log.error(
                    f"API Response: {endpoint} | 500 | {ms:.0f}ms | {type(e).__name__}: {e}",
                    extra=_dimensions(event_type="api_response", function_name=fn,
                                      method=method, endpoint=endpoint,
                                      status_code=500, success=False, duration_ms=ms,
                                      exception_type=type(e).__name__,
                                      exception_message=str(e),
                                      exception_trace=tb.format_exc()))
                raise

        return wrapper
    return decorator


# ─── Helper Loggers ──────────────────────────────────────────────────────────

def log_database_query(logger, query_type: str, duration_ms: float, row_count: int = None):
    """Log a DB query with auto-correlation (unified schema)."""
    logger.info(f"Database Query: {query_type} | {duration_ms:.0f}ms | rows={row_count}",
                extra=_dimensions(event_type="database_query", operation=query_type,
                                  status_code=200, success=True,
                                  duration_ms=duration_ms, row_count=row_count))


def log_external_call(logger, service: str, operation: str, duration_ms: float, success: bool):
    """Log an external call (ADX, LAW, etc.) with auto-correlation (unified schema)."""
    lvl = logging.INFO if success else logging.WARNING
    logger.log(lvl, f"External: {service}.{operation} | {duration_ms:.0f}ms | ok={success}",
               extra=_dimensions(event_type="external_call", service_name=service,
                                 operation=operation, duration_ms=duration_ms,
                                 status_code=200 if success else 500, success=success))



def _row_count(result):
    """Best-effort row count for a helper's return value (DataFrame / list / None)."""
    if result is None or isinstance(result, (str, bytes)):
        return None
    try:
        return len(result)
    except TypeError:
        return None


def log_dependency(service: str, operation: str = None, kind: str = "external"):
    """
    Decorator for shared data-access helpers (DB / ADX / LAW / HTTP).

    Wrap a helper ONCE (e.g. readFromADX, queryDw, queryInLogAnalytics) and every
    call is logged automatically with timing, row count, success/failure and any
    exception (which is logged then re-raised). No changes needed in the callers.

        @log_dependency("ADX", "kusto_query")
        def readFromADX(query): ...

    kind="database" emits a database_query event; anything else emits external_call.
    """
    def decorator(func):
        _log = get_logger(func.__module__)
        op = operation or func.__name__

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            event = "database_query" if kind == "database" else "external_call"
            t0 = time.time()
            try:
                result = func(*args, **kwargs)
                ms = (time.time() - t0) * 1000
                rc = _row_count(result)
                label = "Database Query" if kind == "database" else "External"
                _log.info(
                    f"{label}: {service}.{op} | {ms:.0f}ms | rows={rc}",
                    extra=_dimensions(event_type=event, service_name=service, operation=op,
                                      function_name=func.__name__, status_code=200,
                                      success=True, duration_ms=ms, row_count=rc))
                return result
            except Exception as e:
                ms = (time.time() - t0) * 1000
                _log.error(
                    f"{service}.{op} FAILED | {ms:.0f}ms | {type(e).__name__}: {e}",
                    extra=_dimensions(event_type=event, service_name=service, operation=op,
                                      function_name=func.__name__, status_code=500,
                                      success=False, duration_ms=ms,
                                      exception_type=type(e).__name__,
                                      exception_message=str(e),
                                      exception_trace=tb.format_exc()))
                raise

        return wrapper
    return decorator
