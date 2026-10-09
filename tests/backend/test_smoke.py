"""Smoke tests: the v3 backend layers resolve and the Flask app boots with all routes."""
import importlib.util

import pytest

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("module", [
    "domains.alerts",
    "domains.chatops",
    "domains.metadata",
    "domains.metrics",
])
def test_domains_are_importable(module):
    assert importlib.util.find_spec(module) is not None, f"missing {module}"


@pytest.mark.parametrize("module", [
    "shared.environment",
    "shared.dataBase",
    "shared.keyVault",
    "shared.adx",
    "shared.logAnalytics",
    "shared.appinsightsLogger",
])
def test_shared_connectors_are_importable(module):
    assert importlib.util.find_spec(module) is not None, f"missing {module}"


def test_app_boots_with_all_blueprints(app):
    for blueprint in ("alerts", "analytics", "infrastructure", "application", "chatInitiator",
                      "network", "metadata", "misc", "security"):
        assert blueprint in app.blueprints, f"blueprint {blueprint} not registered"
        assert any(r.endpoint.startswith(f"{blueprint}.") for r in app.url_map.iter_rules()), \
            f"blueprint {blueprint} has no routes"


@pytest.mark.parametrize("path", [
    # Called by the frontend via getUrl() (ingress prefix /api)
    "/api/anomaliesList",
    "/api/anomaliesInfo",
    "/api/infrastructureMetrics/performanceMetrics",
    "/api/infrastructureMetrics/userMetrics",
    "/api/environment",
])
def test_frontend_routes_are_registered(app, path):
    assert path in {r.rule for r in app.url_map.iter_rules()}
