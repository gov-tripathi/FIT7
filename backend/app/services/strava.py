"""Strava API v3 — OAuth2 + activity sync service."""
from __future__ import annotations

import base64
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from ..config import get_settings
from .crypto import decrypt, encrypt

logger = logging.getLogger(__name__)

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"

# Strava sport_type → our internal type
_TYPE_MAP: dict[str, str] = {
    "Run": "running",
    "TrailRun": "running",
    "VirtualRun": "running",
    "Ride": "cycling",
    "VirtualRide": "cycling",
    "EBikeRide": "cycling",
    "MountainBikeRide": "cycling",
    "GravelRide": "cycling",
    "Walk": "walking",
    "Hike": "walking",
    "Swim": "swimming",
    "WeightTraining": "strength_training",
    "Crossfit": "strength_training",
    "Yoga": "yoga",
    "Rowing": "rowing",
    "Workout": "workout",
}


class StravaError(Exception):
    pass


class StravaTokenExpired(StravaError):
    pass


# ────────────────────────────────────────────────────────────
# OAuth helpers
# ────────────────────────────────────────────────────────────

def make_state(user_id: str) -> str:
    """Encode user_id into the OAuth state parameter."""
    return base64.urlsafe_b64encode(user_id.encode()).decode()


def parse_state(state: str) -> str:
    """Decode user_id from OAuth state parameter."""
    try:
        return base64.urlsafe_b64decode(state.encode()).decode()
    except Exception as exc:
        raise StravaError(f"Invalid state: {exc}") from exc


def get_auth_url(user_id: str) -> str:
    s = get_settings()
    if not s.STRAVA_CLIENT_ID:
        raise StravaError("STRAVA_CLIENT_ID not configured")
    state = make_state(user_id)
    params = (
        f"client_id={s.STRAVA_CLIENT_ID}"
        f"&redirect_uri={s.STRAVA_REDIRECT_URI}"
        f"&response_type=code"
        f"&approval_prompt=auto"
        f"&scope=read,activity:read_all"
        f"&state={state}"
    )
    return f"{STRAVA_AUTH_URL}?{params}"


async def exchange_code(code: str) -> dict[str, Any]:
    """Exchange auth code for access + refresh tokens."""
    s = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            STRAVA_TOKEN_URL,
            data={
                "client_id": s.STRAVA_CLIENT_ID,
                "client_secret": s.STRAVA_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        if resp.status_code != 200:
            raise StravaError(f"Token exchange failed: {resp.text}")
        return resp.json()


async def refresh_access_token(refresh_token_plain: str) -> dict[str, Any]:
    """Refresh an expired access token."""
    s = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            STRAVA_TOKEN_URL,
            data={
                "client_id": s.STRAVA_CLIENT_ID,
                "client_secret": s.STRAVA_CLIENT_SECRET,
                "refresh_token": refresh_token_plain,
                "grant_type": "refresh_token",
            },
        )
        if resp.status_code != 200:
            raise StravaError(f"Token refresh failed: {resp.text}")
        return resp.json()


# ────────────────────────────────────────────────────────────
# Token management
# ────────────────────────────────────────────────────────────

def store_tokens(db: Any, user_id: str, token_data: dict[str, Any]) -> None:
    """Persist (encrypted) Strava tokens to profiles table."""
    athlete = token_data.get("athlete") or {}
    patch = {
        "strava_access_token": encrypt(token_data["access_token"]),
        "strava_refresh_token": encrypt(token_data["refresh_token"]),
        "strava_expires_at": token_data["expires_at"],
        "strava_athlete_id": athlete.get("id"),
        "strava_connected": True,
    }
    db.table("profiles").update(patch).eq("id", user_id).execute()


async def get_valid_token(db: Any, user_id: str) -> str:
    """Return a valid access token, refreshing if expired."""
    prof = db.table("profiles").select(
        "strava_access_token,strava_refresh_token,strava_expires_at"
    ).eq("id", user_id).single().execute().data or {}

    access_enc = prof.get("strava_access_token")
    refresh_enc = prof.get("strava_refresh_token")
    expires_at = prof.get("strava_expires_at") or 0

    if not access_enc or not refresh_enc:
        raise StravaError("Strava not connected")

    access_token = decrypt(access_enc)
    refresh_token_plain = decrypt(refresh_enc)

    # Refresh if token expires within 5 minutes
    if int(time.time()) >= int(expires_at) - 300:
        logger.info("Strava token expired — refreshing for user %s", user_id)
        token_data = await refresh_access_token(refresh_token_plain)
        store_tokens(db, user_id, token_data)
        access_token = token_data["access_token"]

    return access_token


# ────────────────────────────────────────────────────────────
# Activity sync
# ────────────────────────────────────────────────────────────

def _map_activity(raw: dict[str, Any], user_id: str) -> dict[str, Any]:
    sport = raw.get("sport_type") or raw.get("type") or "workout"
    act_type = _TYPE_MAP.get(sport, "workout")

    start_str = raw.get("start_date_local") or raw.get("start_date")
    started_at: Optional[str] = None
    act_date: Optional[str] = None
    if start_str:
        try:
            dt = datetime.fromisoformat(start_str.rstrip("Z"))
            started_at = dt.isoformat()
            act_date = dt.date().isoformat()
        except ValueError:
            pass

    distance_m = raw.get("distance") or 0
    moving_time_s = raw.get("moving_time") or 0
    elapsed_time_s = raw.get("elapsed_time") or moving_time_s

    duration_mins = round(elapsed_time_s / 60, 1) if elapsed_time_s else None
    distance_km = round(distance_m / 1000, 2) if distance_m else None

    avg_pace: Optional[float] = None
    if distance_km and duration_mins and distance_km > 0:
        avg_pace = round(duration_mins / distance_km, 2)

    return {
        "user_id": user_id,
        "strava_id": raw["id"],
        "source": "strava",
        "date": act_date or datetime.now(timezone.utc).date().isoformat(),
        "started_at": started_at,
        "type": act_type,
        "name": raw.get("name"),
        "distance_km": distance_km,
        "duration_mins": duration_mins,
        "calories_burned": raw.get("calories") or raw.get("kilojoules"),
        "avg_hr": raw.get("average_heartrate"),
        "max_hr": raw.get("max_heartrate"),
        "avg_pace_min_km": avg_pace,
        "elevation_m": raw.get("total_elevation_gain"),
    }


async def sync_activities(
    db: Any,
    user_id: str,
    after_ts: Optional[int] = None,
    per_page: int = 50,
) -> list[dict[str, Any]]:
    """Fetch recent Strava activities and upsert into DB. Returns list of rows."""
    token = await get_valid_token(db, user_id)

    params: dict[str, Any] = {"per_page": per_page}
    if after_ts:
        params["after"] = after_ts
    else:
        # Default: last 30 days
        params["after"] = int(time.time()) - 30 * 86400

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{STRAVA_API_BASE}/athlete/activities",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
        if resp.status_code == 401:
            raise StravaTokenExpired("Strava token invalid — re-connect")
        if resp.status_code != 200:
            raise StravaError(f"Activities fetch failed: {resp.text}")
        raw_activities: list[dict[str, Any]] = resp.json()

    if not raw_activities:
        return []

    mapped = [_map_activity(a, user_id) for a in raw_activities]

    res = db.table("activities").upsert(mapped, on_conflict="strava_id").execute()
    return res.data or []


async def fetch_athlete_profile(access_token: str) -> dict[str, Any]:
    """Fetch the authenticated athlete's profile from Strava."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{STRAVA_API_BASE}/athlete",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code != 200:
            raise StravaError(f"Athlete fetch failed: {resp.text}")
        return resp.json()
