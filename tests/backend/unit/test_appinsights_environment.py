"""shared.appinsightsLogger: every log record is tagged with the DEPLOYMENT_ENV environment."""
import socket

import pytest

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("env, expected", [
    ("production", "production"),
    ("staging", "staging"),
    ("development", "development"),
])
def test_dimensions_carry_deployment_env(reload_with_env, env, expected):
    logger = reload_with_env(env, "shared.appinsightsLogger")
    assert logger.ENVIRONMENT == expected
    assert logger._dimensions()["environment"] == expected


def test_pod_hostname_does_not_change_environment(reload_with_env, monkeypatch):
    # Regression: in AKS the hostname is the pod name, which used to force "development".
    monkeypatch.setattr(socket, "gethostname", lambda: "itelemetry-backend-7d9c-abcde")
    logger = reload_with_env("production", "shared.appinsightsLogger")
    assert logger._dimensions()["environment"] == "production"


def test_logger_does_not_use_socket():
    import shared.appinsightsLogger as logger
    assert not hasattr(logger, "socket")
