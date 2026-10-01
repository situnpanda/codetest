"""Security HTTP route slice (consolidated).

Web/routing layer for the credential-inventory / security endpoint. Business
logic lives in ``domains.metrics.security.securityMetrics``; this module only wires HTTP
requests to those functions and returns the uniform success/error envelope.
"""
from flask import Blueprint, request

from shared.appinsightsLogger import log_performance, error_response
from domains.metrics.security.securityMetrics import get_credential_inventory

security_bp = Blueprint("security", __name__)


@security_bp.route('/api/credentialInventory', methods=['POST'])
@log_performance()
def getCredentialInventory():
    try:
        data = request.get_json() or {}
        return get_credential_inventory(data)
    except Exception as ex:
        return error_response(500, "Failed to fetch credential inventory", exc=ex)
