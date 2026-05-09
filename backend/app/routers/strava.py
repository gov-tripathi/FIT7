"""Strava OAuth2 + sync endpoints."""
from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse

from ..deps import CurrentUser, get_current_user, get_db
from ..services import strava as strava_service

router = APIRouter(prefix="/strava", tags=["strava"])


# ─── OAuth ───────────────────────────────────────────────────

@router.get("/connect")
def strava_connect_url(user: CurrentUser = Depends(get_current_user)):
    """Return the Strava OAuth authorization URL for this user."""
    try:
        url = strava_service.get_auth_url(user.id)
    except strava_service.StravaError as e:
        raise HTTPException(400, str(e))
    return {"url": url}


@router.get("/callback", response_class=HTMLResponse)
async def strava_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    db=Depends(get_db),
):
    """OAuth2 callback — exchanges the code, stores tokens, closes the popup."""
    if error:
        return _close_popup(success=False, message=f"Strava authorization denied: {error}")

    if not code or not state:
        return _close_popup(success=False, message="Missing code or state")

    try:
        user_id = strava_service.parse_state(state)
    except strava_service.StravaError as e:
        return _close_popup(success=False, message=str(e))

    try:
        token_data = await strava_service.exchange_code(code)
    except strava_service.StravaError as e:
        return _close_popup(success=False, message=str(e))

    try:
        strava_service.store_tokens(db, user_id, token_data)
    except Exception as e:
        return _close_popup(success=False, message=f"DB error: {e}")

    return _close_popup(success=True, message="Strava connected successfully!")


def _close_popup(success: bool, message: str) -> HTMLResponse:
    status_color = "#22c55e" if success else "#ef4444"
    event = "strava:connected" if success else "strava:error"
    return HTMLResponse(f"""<!DOCTYPE html>
<html>
<head><title>FitFuel — Strava</title></head>
<body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;
            display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center;max-width:360px">
    <div style="font-size:48px">{"✓" if success else "✗"}</div>
    <p style="color:{status_color};font-size:18px;font-weight:600">{message}</p>
    <p style="color:#94a3b8;font-size:14px">This window will close automatically…</p>
  </div>
  <script>
    if (window.opener) {{
      window.opener.dispatchEvent(new CustomEvent('{event}', {{detail: {{message: '{message}'}}}}) );
    }}
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>""")


# ─── Status ──────────────────────────────────────────────────

@router.get("/status")
def strava_status(user: CurrentUser = Depends(get_current_user), db=Depends(get_db)):
    prof = (
        db.table("profiles")
        .select("strava_connected,strava_athlete_id,strava_expires_at")
        .eq("id", user.id)
        .single()
        .execute()
        .data
        or {}
    )
    connected = bool(prof.get("strava_connected"))
    expires_at = prof.get("strava_expires_at") or 0
    token_valid = connected and int(time.time()) < int(expires_at)
    return {
        "connected": connected,
        "token_valid": token_valid,
        "athlete_id": prof.get("strava_athlete_id"),
    }


# ─── Sync ────────────────────────────────────────────────────

@router.post("/sync")
async def strava_sync(
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    """Manually trigger a Strava activity sync (last 30 days)."""
    try:
        activities = await strava_service.sync_activities(db, user.id)
    except strava_service.StravaError as e:
        raise HTTPException(502, str(e))
    return {
        "status": "success",
        "source": "strava",
        "activities_new": len(activities),
    }


# ─── Disconnect ──────────────────────────────────────────────

@router.delete("/disconnect")
def strava_disconnect(user: CurrentUser = Depends(get_current_user), db=Depends(get_db)):
    """Remove Strava tokens and mark as disconnected."""
    db.table("profiles").update({
        "strava_access_token": None,
        "strava_refresh_token": None,
        "strava_expires_at": None,
        "strava_athlete_id": None,
        "strava_connected": False,
    }).eq("id", user.id).execute()
    return {"ok": True}
