"""Performance metrics only read App Insights records for the current environment."""
import json

import pandas as pd
import pytest

pytestmark = pytest.mark.unit


@pytest.fixture()
def captured_queries(app, monkeypatch):
    from domains.metrics.infrastructure import userMetrics

    queries = []

    def fake_query(workspace_id, query, *args):
        queries.append(query)
        return pd.DataFrame()

    monkeypatch.setattr(userMetrics, "queryInLogAnalytics", fake_query)
    monkeypatch.setattr(userMetrics, "ENVIRONMENT", "staging")
    return queries


def test_all_perf_queries_filter_on_environment(captured_queries):
    from domains.metrics.infrastructure import userMetrics

    result = userMetrics.get_performance_metrics(7)

    assert result["status"] == 200
    assert len(captured_queries) == 4
    for query in captured_queries:
        assert "tostring(Properties['environment']) == 'staging'" in query
        assert "'production'" not in query


def test_performance_metrics_endpoint(client, captured_queries):
    response = client.get("/api/infrastructureMetrics/performanceMetrics?days=14")

    assert response.status_code == 200
    payload = json.loads(response.get_json()["Data"])
    assert payload["windowDays"] == 14
    for key in ("endpoints", "errorLogs", "databases", "databaseErrorLogs"):
        assert key in payload
    assert all("'staging'" in q for q in captured_queries)


def test_invalid_days_falls_back_to_7(client, captured_queries):
    response = client.get("/api/infrastructureMetrics/performanceMetrics?days=abc")

    assert response.status_code == 200
    assert json.loads(response.get_json()["Data"])["windowDays"] == 7
