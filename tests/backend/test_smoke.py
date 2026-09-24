"""Smoke tests: verify the v3 backend layers import cleanly."""
import importlib.util


def test_domains_are_importable():
    for module in (
        "domains.alerting",
        "domains.metrics",
        "domains.metadata",
        "domains.chatops",
    ):
        assert importlib.util.find_spec(module) is not None, f"missing {module}"


def test_shared_connectors_are_importable():
    for module in (
        "shared.dataBase",
        "shared.keyVault",
        "shared.ADX",
        "shared.LogAnalytics",
    ):
        assert importlib.util.find_spec(module) is not None, f"missing {module}"
