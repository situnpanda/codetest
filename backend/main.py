"""iTelemetry backend entry point and composition root.

The Flask application, all HTTP route wiring, and app-level routes live here.
Domain logic lives in ``domains`` (alerting, metrics, metadata, chatops),
cross-cutting connectors and helpers in ``shared``, VSA route slices in
``apis``, and batch scripts in ``jobs``.
"""
import os
import sys

# Ensure the backend root is importable (apis.*, domains.*, shared.*)
# regardless of the current working directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from flask_compress import Compress
from flask_swagger_ui import get_swaggerui_blueprint

app = Flask(__name__)
Compress(app)
from shared.appinsightsLogger import initialize_azure_monitor
initialize_azure_monitor()
from apis.alerts import alerts_bp
from apis.analytics import analytics_bp
from apis.infrastructure import infrastructure_bp
from apis.application import application_bp
from apis.chatops import chatOps
from apis.network import network_bp
from apis.metadata import metadata_bp
from apis.misc import misc_bp
from apis.security import security_bp


ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:9090",
    "https://itelemetry.providence.org",
    "https://iTelemetryStag.providence.org",
    "https://itelemetry.wu2.cloud.providence.org",
    "https://itelemetry.testwu2.cloud.providence.org",
    "https://itelemetry.devwu2.cloud.providence.org",
    "http://100.100.132.163:5090",
    "http://100.100.132.166:5090",
    "http://100.100.129.88:5090",
    "http://100.100.129.8:5090",
    "https://cloud.uipath.com"
]
CORS(app, origins=ALLOWED_ORIGINS)

swaggerui_blueprint = get_swaggerui_blueprint('/swagger', '/swagger.json')
app.register_blueprint(swaggerui_blueprint, url_prefix='/swagger')

app.register_blueprint(alerts_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(infrastructure_bp)
app.register_blueprint(application_bp)
app.register_blueprint(chatOps)
app.register_blueprint(network_bp)
app.register_blueprint(metadata_bp)
app.register_blueprint(misc_bp)
app.register_blueprint(security_bp)


@app.route('/swagger.json')
def generate_swagger():
    with open('./swagger.json') as file:
           swagger_data = file.read()
    return swagger_data

@app.route("/api")
def index():
    for rule in app.url_map.iter_rules():
        print()
        print(f"  {rule} -> methods: {sorted(rule.methods)}")
    return "Hello"


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)

