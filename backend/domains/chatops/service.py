"""Standalone ChatOps microservice entry point.

Runs *only* the chatops domain as an independent Flask service. The ``shared``
connector package and the ``domains.chatops`` module must be importable (both
are bundled into the image by the Dockerfile in this folder).
"""
import os
import sys

# Backend root (…/backend) on the path so `shared` and `domains` resolve.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from flask import Flask  # noqa: E402
from flask_cors import CORS  # noqa: E402

from apis.chatops import chatOps  # noqa: E402


def create_app():
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(chatOps)
    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001)
