"""Shared pytest setup for iTelemetry.

- Puts backend/ on sys.path so tests import apis.*, domains.*, shared.*, main.
- Never exports test telemetry to Application Insights.
- Integration tests (marker ``integration``) only run when ITELEMETRY_LIVE_TESTS=1
  (requires ``az login`` + network). Otherwise they are skipped.
- In offline runs Key Vault is stubbed while ``main`` is imported, because
  domains/metadata/getComponentList.py reads a secret at import time.
"""
import importlib
import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
FRONTEND_ROOT = REPO_ROOT / "frontend"

# Make the backend importable (domains.*, shared.*, apis.*) from tests.
sys.path.insert(0, str(BACKEND_ROOT))

LIVE = os.getenv("ITELEMETRY_LIVE_TESTS") == "1"

import shared.appinsightsLogger as _appinsights  # noqa: E402

# Marks App Insights as already initialised -> no Key Vault lookup, no exporter.
_appinsights._initialized = True


def pytest_collection_modifyitems(config, items):
    if LIVE:
        return
    skip_live = pytest.mark.skip(reason="live test: set ITELEMETRY_LIVE_TESTS=1 (needs az login + network)")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_live)


class _FakeSecret:
    value = ""


class _FakeSecretClient:
    def __init__(self, *args, **kwargs):
        pass

    def get_secret(self, name):
        return _FakeSecret()


@pytest.fixture(scope="session")
def app():
    """The Flask app under test (composition root in main.py)."""
    with pytest.MonkeyPatch.context() as mp:
        if not LIVE:
            import shared.keyVault as key_vault
            mp.setattr(key_vault, "SecretClient", _FakeSecretClient)
        from main import app as flask_app

    flask_app.config.update(TESTING=True)
    return flask_app


@pytest.fixture()
def reload_with_env(monkeypatch):
    """Re-import env-dependent modules under a given DEPLOYMENT_ENV.

    Usage: ``adx = reload_with_env("staging", "shared.adx")`` returns the last
    reloaded module. Modules are reloaded again with the original environment
    after the test so later tests are unaffected.
    """
    reloaded = []

    def _reload(env, *module_names):
        if env is None:
            monkeypatch.delenv("DEPLOYMENT_ENV", raising=False)
        else:
            monkeypatch.setenv("DEPLOYMENT_ENV", env)
        modules = [importlib.import_module(name) for name in ("shared.environment", *module_names)]
        for module in modules:
            importlib.reload(module)
        _appinsights._initialized = True
        reloaded[:] = modules
        return modules[-1]

    yield _reload

    monkeypatch.undo()
    for module in reloaded:
        importlib.reload(module)
    _appinsights._initialized = True


@pytest.fixture()
def client(app):
    """A test client for issuing requests without a live server."""
    return app.test_client()
