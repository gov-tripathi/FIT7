from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import CurrentUser, get_current_user, get_db
from ..services import garmin as garmin_service
from ..services import garmin_browser
from ..services.crypto import decrypt, encrypt

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    goal: Optional[str] = Field(
        default=None,
        pattern="^(weight_loss|muscle_gain|performance|recovery|maintenance)$",
    )
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    birth_year: Optional[int] = None
    sex: Optional[str] = Field(default=None, pattern="^(male|female|other)$")


class GarminCreds(BaseModel):
    email: str
    password: str


@router.get("")
def get_profile(user: CurrentUser = Depends(get_current_user), db=Depends(get_db)):
    res = db.table("profiles").select("*").eq("id", user.id).single().execute()
    return res.data


@router.patch("")
def update_profile(
    payload: ProfileUpdate,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "Nothing to update")
    res = db.table("profiles").update(data).eq("id", user.id).execute()
    return res.data[0] if res.data else {}


def _merge_garmin_profile(
    db, user_id: str, email: str | None, password: str | None
) -> dict:
    """Pull personal data from Garmin and merge into the profile row.

    Only fills fields that are currently empty on the profile — we never
    overwrite values the user has edited manually, except for weight which
    Garmin tracks daily (weigh-ins) and is always fresher.
    """
    details = garmin_service.fetch_profile_details(user_id, email, password)
    if not details:
        return {}

    existing = (
        db.table("profiles").select("*").eq("id", user_id).single().execute().data
        or {}
    )
    patch: dict = {}
    for key, value in details.items():
        if value is None:
            continue
        # weight_kg: always prefer latest Garmin weigh-in.
        # Everything else: only set if the profile currently lacks it.
        if key == "weight_kg" or not existing.get(key):
            patch[key] = value

    if patch:
        db.table("profiles").update(patch).eq("id", user_id).execute()
    return patch


@router.post("/garmin")
def save_garmin_credentials(
    creds: GarminCreds,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("profiles").update(
        {
            "garmin_email": creds.email,
            "garmin_token": encrypt(creds.password),
            "garmin_enabled": True,
        }
    ).eq("id", user.id).execute()

    for table in ("activities", "health_metrics", "food_logs", "sync_logs"):
        db.table(table).delete().eq("user_id", user.id).execute()

    imported: dict = {}
    import_error: str | None = None
    try:
        imported = _merge_garmin_profile(db, user.id, creds.email, creds.password)
    except garmin_service.GarminSyncError as e:
        import_error = str(e)
    except Exception as e:
        import_error = f"Profile import failed ({type(e).__name__}): {e}"

    return {"ok": True, "imported": imported, "import_error": import_error}


@router.post("/garmin/import")
def import_garmin_profile(
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    """Re-pull the user's personal data from Garmin on demand."""
    prof = (
        db.table("profiles")
        .select("garmin_email,garmin_token")
        .eq("id", user.id)
        .single()
        .execute()
        .data
        or {}
    )
    email = prof.get("garmin_email")
    encrypted = prof.get("garmin_token")
    password = decrypt(encrypted) if encrypted else None

    if not (email and password):
        raise HTTPException(
            400, "Garmin not connected — save your credentials first"
        )

    try:
        imported = _merge_garmin_profile(db, user.id, email, password)
    except garmin_service.GarminSyncError as e:
        raise HTTPException(502, f"Garmin profile import failed: {e}")

    if not imported:
        return {"imported": {}, "message": "No new fields returned by Garmin"}
    return {"imported": imported}


@router.post("/garmin/connect")
def garmin_direct_connect(
    creds: GarminCreds,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    """Connect Garmin via direct HTTP login — no browser needed.

    Uses garth's OAuth flow (same as the Garmin mobile app). Saves tokens
    to disk so subsequent syncs work without re-entering credentials.
    Password is NOT stored in the database.
    """
    try:
        result = garmin_service.direct_login(user.id, creds.email, creds.password)
    except garmin_service.GarminSyncError as e:
        raise HTTPException(status_code=502, detail=str(e))

    db.table("profiles").update({
        "garmin_email": creds.email,
        "garmin_enabled": True,
    }).eq("id", user.id).execute()

    imported: dict = {}
    try:
        imported = _merge_garmin_profile(db, user.id, None, None)
    except Exception:
        pass

    return {
        "ok": True,
        "display_name": result.get("display_name"),
        "imported": imported,
    }


@router.get("/garmin/status")
def garmin_session_status(user: CurrentUser = Depends(get_current_user)):
    """Report Garmin connection status (garth tokens + browser session)."""
    return {
        "has_garth_session": garmin_service.has_garth_session(user.id),
        "has_browser_session": garmin_browser.has_valid_session(user.id),
    }


@router.post("/garmin/browser-login")
async def garmin_browser_login(
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    """Launch a local Chromium window, block until the user signs into Garmin,
    persist the cookie session to disk. Subsequent syncs use it automatically.

    Long-running (up to 4 minutes). Safe to call repeatedly — it will re-use
    the Chromium profile dir, so second logins often skip the captcha.
    """
    try:
        result = await asyncio.to_thread(
            garmin_browser.interactive_login, user.id, 240
        )
    except RuntimeError as e:
        raise HTTPException(status_code=408, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Browser login failed ({type(e).__name__}): {e}",
        )

    # Mark Garmin as connected in the profile (enables the sync path) and
    # import personal data while we have a hot session.
    db.table("profiles").update({"garmin_enabled": True}).eq("id", user.id).execute()

    imported: dict = {}
    try:
        imported = _merge_garmin_profile(db, user.id, None, None)  # uses cookies
    except Exception:
        pass

    return {
        "ok": True,
        "status": result.get("status"),
        "duration_s": result.get("duration_s"),
        "imported": imported,
    }


@router.delete("/garmin/browser-session")
def garmin_clear_browser_session(user: CurrentUser = Depends(get_current_user)):
    removed = garmin_browser.clear_session(user.id)
    return {"removed": removed}


@router.delete("/garmin/browser-profile")
def garmin_clear_browser_profile(user: CurrentUser = Depends(get_current_user)):
    """Delete the cached Chromium profile. Use this when Garmin shows
    'unexpected error' — a fresh profile bypasses bot-detection bans."""
    session_removed = garmin_browser.clear_session(user.id)
    profile_removed = garmin_browser.clear_chromium_profile(user.id)
    return {"session_removed": session_removed, "profile_removed": profile_removed}
