"""shared.adx: reads go to the ADX cluster for the current DEPLOYMENT_ENV."""
import pytest

pytestmark = pytest.mark.unit

EXPECTED_CLUSTER = {
    "production": "https://telemetrycrcav2.westus2.kusto.windows.net",
    "staging": "https://telemetrycrcav2stag.westus2.kusto.windows.net",
    "development": "https://telemetrycrcav2dev.westus2.kusto.windows.net",
}


@pytest.mark.parametrize("env, expected", [
    ("production", "production"),
    ("staging", "staging"),
    ("development", "development"),
    (None, "development"),
])
def test_cluster_follows_deployment_env(reload_with_env, env, expected):
    adx = reload_with_env(env, "shared.adx")
    assert adx.ADX_CLUSTER == EXPECTED_CLUSTER[expected]
    assert adx.ADX_DATABASE == "crca_monitoring_telemetry"


def test_every_environment_has_a_cluster():
    import shared.adx as adx
    assert adx.ADX_CLUSTER_BY_ENV == EXPECTED_CLUSTER


def test_read_from_adx_queries_the_env_cluster(reload_with_env, monkeypatch):
    adx = reload_with_env("staging", "shared.adx")
    calls = {}

    class FakeClient:
        def execute_query(self, database, query):
            calls["database"] = database
            calls["query"] = query
            return type("Result", (), {"primary_results": ["table"]})()

    def fake_connect(cluster):
        calls["cluster"] = cluster
        return FakeClient()

    monkeypatch.setattr(adx, "connectToADX", fake_connect)
    monkeypatch.setattr(adx, "dataframe_from_result_table", lambda table: f"df:{table}")

    assert adx.readFromADX("print ok=1") == "df:table"
    assert calls["cluster"] == EXPECTED_CLUSTER["staging"]
    assert calls["database"] == "crca_monitoring_telemetry"
    assert "print ok=1" in calls["query"]
