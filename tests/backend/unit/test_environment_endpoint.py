"""GET /api/environment reports what the backend resolved from DEPLOYMENT_ENV."""
import json

import pytest

pytestmark = pytest.mark.unit


def test_environment_endpoint(client, monkeypatch):
    import apis.misc as misc

    monkeypatch.setattr(misc, "ENVIRONMENT", "staging")
    monkeypatch.setattr(misc, "ADX_CLUSTER", "https://telemetrycrcav2stag.westus2.kusto.windows.net")
    monkeypatch.setenv("DEPLOYMENT_ENV", "staging")

    response = client.get("/api/environment")

    assert response.status_code == 200
    info = json.loads(response.get_json()["Data"])
    assert info == {
        "environment": "staging",
        "deploymentEnvSet": True,
        "appInsightsEnabled": False,  # tests never initialise the exporter
        "adxCluster": "https://telemetrycrcav2stag.westus2.kusto.windows.net",
        "adxDatabase": "crca_monitoring_telemetry",
    }


def test_environment_endpoint_reports_missing_deployment_env(client, monkeypatch):
    monkeypatch.delenv("DEPLOYMENT_ENV", raising=False)
    info = json.loads(client.get("/api/environment").get_json()["Data"])
    assert info["deploymentEnvSet"] is False


def test_environment_endpoint_exposes_no_secrets(client):
    body = client.get("/api/environment").get_data(as_text=True).lower()
    for word in ("connectionstring", "instrumentationkey", "password", "secret"):
        assert word not in body
