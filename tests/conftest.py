import os
import sys
from pathlib import Path

import pytest

# Make the backend importable (domains.*, shared.*, apis.*) from tests.
BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture(scope="session")
def app():
    """The Flask app under test (composition root in main.py)."""
    from main import app as flask_app

    flask_app.config.update(TESTING=True)
    return flask_app


@pytest.fixture()
def client(app):
    """A test client for issuing requests without a live server."""
    return app.test_client()
