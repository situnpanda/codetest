"""
Single source of truth for the backend's deployment environment.

The environment comes ONLY from the DEPLOYMENT_ENV env var, which the Helm chart
sets per environment (values-{prod,stag,dev}.yaml -> backend.env.DEPLOYMENT_ENV).
Hostname is intentionally NOT used: inside AKS it is the pod name.

Usage:
    from shared.environment import ENVIRONMENT   # "production" | "staging" | "development"
"""

import os

PRODUCTION = "production"
STAGING = "staging"
DEVELOPMENT = "development"

_ALIASES = {
    "prod": PRODUCTION, "production": PRODUCTION,
    "stag": STAGING, "stage": STAGING, "staging": STAGING, "test": STAGING,
    "dev": DEVELOPMENT, "development": DEVELOPMENT, "local": DEVELOPMENT,
}


def resolve_environment():
    raw = (os.getenv("DEPLOYMENT_ENV") or "").strip().lower()
    if not raw:
        print(f"[Environment] DEPLOYMENT_ENV not set -> defaulting to '{DEVELOPMENT}'")
        return DEVELOPMENT
    env = _ALIASES.get(raw)
    if env is None:
        print(f"[Environment] Unknown DEPLOYMENT_ENV='{raw}' -> defaulting to '{DEVELOPMENT}'")
        return DEVELOPMENT
    return env


ENVIRONMENT = resolve_environment()
