"""Auth dependency: verifies the Supabase-issued JWT and returns the user id."""
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings
from .mockdb import get_mock_db
from .supabase_client import user_client


@dataclass
class CurrentUser:
    id: str
    email: Optional[str]
    access_token: str


def _extract_bearer(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    return authorization.split(" ", 1)[1].strip()


def _is_dev_mode(secret: str) -> bool:
    """Dev mode = no real secret configured. Accepts empty string or
    obvious placeholders from .env.example."""
    if not secret:
        return True
    placeholders = {"your-jwt-secret", "your-anon-key", "your-service-role-key"}
    return secret.strip().lower() in placeholders


def get_current_user(authorization: Optional[str] = Header(default=None)) -> CurrentUser:
    token = _extract_bearer(authorization)
    s = get_settings()

    if _is_dev_mode(s.SUPABASE_JWT_SECRET):
        # Dev fallback: decode without verification so the app is runnable
        # before Supabase is configured. DO NOT ship this way.
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
        except jwt.PyJWTError as e:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")
    else:
        try:
            payload = jwt.decode(
                token,
                s.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.PyJWTError as e:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing sub")

    return CurrentUser(id=user_id, email=payload.get("email"), access_token=token)


def get_db(user: CurrentUser = Depends(get_current_user)):
    """Return a Supabase client scoped to the caller's JWT (RLS-aware).

    In dev / guest mode — when Supabase isn't configured — return an
    in-memory mock that implements the same fluent API so the app is fully
    clickable without any external dependency.
    """
    s = get_settings()
    if _is_dev_mode(s.SUPABASE_JWT_SECRET) or not s.SUPABASE_URL or s.SUPABASE_URL.startswith("https://YOUR-"):
        return get_mock_db()
    client = user_client(user.access_token)
    if client is None:
        return get_mock_db()
    return client
