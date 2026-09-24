"""Shared authentication/authorization utilities.

Extracted verbatim from main.py as the first step of the Clean+VSA split so that
every route slice depends on a single auth seam instead of a monolithic module.
Behavior is unchanged.
"""
import time

import jwt

# App registration and Authorization (moved from main.py, values unchanged)
Tenant_ID = "2e319086-9a26-46a3-865f-615bed576786"
Backend_App_ID = "ae71f988-2029-4cfc-ba20-a4f81d4dd452"


def validateToken(token):
    decoded_token = jwt.decode(token, options={"verify_signature": False})
    expiration_time = decoded_token.get("exp")
    audience = decoded_token.get("aud")
    userId = decoded_token.get("sub")
    email_id = decoded_token.get("email") or decoded_token.get("upn") or decoded_token.get("preferred_username")
    issuer = decoded_token.get("iss")

    if expiration_time and time.time() > expiration_time or audience != "api://" + Backend_App_ID:
        print("Token is expired")
        return False, email_id
    else:
        print("Token is valid")
        return True, email_id
