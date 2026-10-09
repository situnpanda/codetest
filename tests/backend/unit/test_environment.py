"""shared.environment: DEPLOYMENT_ENV is the single source of the runtime environment."""
import socket

import pytest

from shared import environment

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("raw, expected", [
    ("production", "production"),
    ("prod", "production"),
    ("  PROD ", "production"),
    ("staging", "staging"),
    ("stag", "staging"),
    ("stage", "staging"),
    ("test", "staging"),
    ("development", "development"),
    ("dev", "development"),
    ("local", "development"),
])
def test_deployment_env_aliases(monkeypatch, raw, expected):
    monkeypatch.setenv("DEPLOYMENT_ENV", raw)
    assert environment.resolve_environment() == expected


@pytest.mark.parametrize("raw", ["", "bogus", "qa1"])
def test_unknown_value_defaults_to_development(monkeypatch, raw):
    monkeypatch.setenv("DEPLOYMENT_ENV", raw)
    assert environment.resolve_environment() == environment.DEVELOPMENT


def test_missing_defaults_to_development(monkeypatch):
    monkeypatch.delenv("DEPLOYMENT_ENV", raising=False)
    assert environment.resolve_environment() == environment.DEVELOPMENT


def test_other_env_vars_and_hostname_are_ignored(monkeypatch):
    # Regression: the pod hostname used to decide the environment, so prod was tagged "development".
    monkeypatch.delenv("DEPLOYMENT_ENV", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr(socket, "gethostname", lambda: "itelemetry.wu2.cloud.providence.org")
    assert environment.resolve_environment() == environment.DEVELOPMENT


def test_module_constant_follows_deployment_env(reload_with_env):
    module = reload_with_env("prod")
    assert module.ENVIRONMENT == "production"
