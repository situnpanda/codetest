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
VALID_ENVIRONMENTS = {PRODUCTION, STAGING, DEVELOPMENT}


def resolve_environment():
    env = (os.getenv("DEPLOYMENT_ENV") or "").strip().lower()
    if not env:
        print(f"[Environment] DEPLOYMENT_ENV not set -> defaulting to '{DEVELOPMENT}'")
        return DEVELOPMENT
    if env not in VALID_ENVIRONMENTS:
        print(f"[Environment] Unknown DEPLOYMENT_ENV='{env}' -> defaulting to '{DEVELOPMENT}'")
        return DEVELOPMENT
    return env


ENVIRONMENT = resolve_environment()
