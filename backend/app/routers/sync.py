from __future__ import annotations

import time

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..deps import CurrentUser, get_current_user, get_db
from ..services import garmin, workout_files
from ..services.crypto import decrypt

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/garmin")
def trigger_sync(user: CurrentUser = Depends(get_current_user), db=Depends(get_db)):
    t0 = time.perf_counter()

    prof_resp = (
        db.table("profiles")
        .select("garmin_email,garmin_token")
        .eq("id", user.id)
        .single()
        .execute()
    )
    prof = prof_resp.data or {}
    garmin_email = prof.get("garmin_email")
    encrypted = prof.get("garmin_token")
    garmin_password = decrypt(encrypted) if encrypted else None

    has_creds = bool(garmin_email and garmin_password)

    try:
        payload = garmin.sync_user(user.id, garmin_email, garmin_password)
    except garmin.GarminSyncError as e:
        duration_ms = int((time.perf_counter() - t0) * 1000)
        db.table("sync_logs").insert(
            {
                "user_id": user.id,
                "status": "failed",
                "activities_new": 0,
                "metrics_new": 0,
                "error_message": str(e),
                "duration_ms": duration_ms,
            }
        ).execute()
        # When the user has configured credentials, surface the real failure
        # instead of silently showing mock data.
        raise HTTPException(status_code=502, detail=f"Garmin sync failed: {e}")

    activities = payload["activities"]
    metrics = payload["metrics"]
    food_logs = payload.get("food_logs") or []
    source = payload.get("source", "mock")

    # Opportunistically refresh biometric fields (weight especially) from
    # Garmin on every real sync. Cheap: the client is already authenticated.
    if has_creds and source == "garmin":
        try:
            details = garmin.fetch_profile_details(user.id, garmin_email, garmin_password)
            existing = (
                db.table("profiles").select("*").eq("id", user.id).single().execute().data
                or {}
            )
            patch = {
                k: v
                for k, v in details.items()
                if v is not None and (k == "weight_kg" or not existing.get(k))
            }
            if patch:
                db.table("profiles").update(patch).eq("id", user.id).execute()
        except Exception:
            pass

    activities_new = 0
    metrics_new = 0
    foods_new = 0
    error: str | None = None

    try:
        if activities:
            res = (
                db.table("activities")
                .upsert(activities, on_conflict="garmin_id")
                .execute()
            )
            activities_new = len(res.data or [])
        if metrics:
            res = (
                db.table("health_metrics")
                .upsert(metrics, on_conflict="user_id,date")
                .execute()
            )
            metrics_new = len(res.data or [])
        if food_logs and not has_creds:
            existing = (
                db.table("food_logs").select("id").eq("user_id", user.id).execute()
            )
            if not (existing.data or []):
                res = db.table("food_logs").insert(food_logs).execute()
                foods_new = len(res.data or [])
        status = "success"
    except Exception as e:
        error = str(e)
        status = "failed"

    duration_ms = int((time.perf_counter() - t0) * 1000)

    db.table("sync_logs").insert(
        {
            "user_id": user.id,
            "status": status,
            "activities_new": activities_new,
            "metrics_new": metrics_new,
            "error_message": error,
            "duration_ms": duration_ms,
        }
    ).execute()

    return {
        "status": status,
        "source": source,
        "activities_new": activities_new,
        "metrics_new": metrics_new,
        "foods_new": foods_new,
        "duration_ms": duration_ms,
        "error": error,
    }


@router.post("/upload")
async def upload_workout_files(
    files: list[UploadFile] = File(...),
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    """Accept one or more FIT / TCX / GPX files and import them as activities.

    No Garmin SSO touched. Re-uploading the same file is idempotent because
    the synthetic `garmin_id` is hashed from (user_id, filename, start, distance).
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    t0 = time.perf_counter()
    parsed: list[dict] = []
    skipped: list[dict] = []

    for f in files:
        raw = await f.read()
        if not raw:
            skipped.append({"name": f.filename, "reason": "empty file"})
            continue
        if len(raw) > 25 * 1024 * 1024:  # 25 MB safety cap
            skipped.append({"name": f.filename, "reason": "file too large (>25 MB)"})
            continue
        try:
            activity = workout_files.parse_workout_file(
                f.filename or "upload", raw, user.id
            )
        except Exception as e:
            skipped.append({"name": f.filename, "reason": f"parse error: {e}"})
            continue
        if not activity:
            skipped.append(
                {
                    "name": f.filename,
                    "reason": "unrecognised format (need .fit, .tcx, or .gpx)",
                }
            )
            continue
        parsed.append(activity)

    activities_new = 0
    error: str | None = None
    if parsed:
        try:
            res = (
                db.table("activities")
                .upsert(parsed, on_conflict="garmin_id")
                .execute()
            )
            activities_new = len(res.data or [])
        except Exception as e:
            error = str(e)

    duration_ms = int((time.perf_counter() - t0) * 1000)
    db.table("sync_logs").insert(
        {
            "user_id": user.id,
            "status": "success" if not error and parsed else "failed",
            "activities_new": activities_new,
            "metrics_new": 0,
            "error_message": error
            or (
                f"No valid files. Skipped: {len(skipped)}"
                if not parsed
                else None
            ),
            "duration_ms": duration_ms,
        }
    ).execute()

    if not parsed and not error:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No activities could be parsed",
                "skipped": skipped,
            },
        )
    if error:
        raise HTTPException(status_code=500, detail=f"DB write failed: {error}")

    return {
        "status": "success",
        "source": "file_upload",
        "activities_new": activities_new,
        "files_parsed": len(parsed),
        "files_skipped": len(skipped),
        "skipped": skipped,
        "duration_ms": duration_ms,
    }


@router.get("/logs")
def sync_logs(user: CurrentUser = Depends(get_current_user), db=Depends(get_db)):
    res = (
        db.table("sync_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("synced_at", desc=True)
        .limit(20)
        .execute()
    )
    return res.data
