"""iTelemetry v3 backend entry point.

Thin composition root. The Flask application and all HTTP route wiring live in
the ``apis`` package (the "only calling" layer). Domain logic lives in
``domains`` (alerting, metrics, metadata, chatops), cross-cutting connectors and
helpers in ``shared``, and batch scripts in ``jobs``.
"""
import os
import sys

# Ensure the backend root is importable regardless of the current working dir.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from apis.app import app  # noqa: E402

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
