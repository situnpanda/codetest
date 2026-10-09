"""Live end-to-end checks against Azure (ADX, Log Analytics, Key Vault).

Skipped unless ITELEMETRY_LIVE_TESTS=1. Requires `az login` (DefaultAzureCredential)
and network access. ADX follower clusters (stag/dev) may be auto-stopped; a failure
there means the cluster is down or not reachable, not a code bug.
"""
import json

import pytest

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("env", ["production", "staging", "development"])
def test_adx_cluster_is_reachable(env):
    import shared.adx as adx

    client = adx.connectToADX(adx.ADX_CLUSTER_BY_ENV[env])
    result = client.execute_query(adx.ADX_DATABASE, "print ok = 1")
    assert result.primary_results[0][0]["ok"] == 1


def test_read_from_adx_current_env():
    import shared.adx as adx

    df = adx.readFromADX("print ok = 1")
    assert int(df["ok"].iloc[0]) == 1


def test_performance_metrics_endpoint_live(client):
    response = client.get("/api/infrastructureMetrics/performanceMetrics?days=7")

    assert response.status_code == 200, response.get_data(as_text=True)[:500]
    payload = json.loads(response.get_json()["Data"])
    assert payload["windowDays"] == 7
    assert isinstance(payload["endpoints"], list)
