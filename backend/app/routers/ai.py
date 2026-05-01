from __future__ import annotations

from datetime import date as date_cls, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import CurrentUser, get_current_user, get_db
from ..services import claude

router = APIRouter(prefix="/ai", tags=["ai"])


class SuggestionAction(BaseModel):
    status: str = Field(pattern="^(accepted|dismissed)$")
    accepted_items: list[dict[str, Any]] | None = None


def _build_context(db, user_id: str) -> dict[str, Any]:
    since = (date_cls.today() - timedelta(days=7)).isoformat()

    activities = (
        db.table("activities")
        .select("type,distance_km,duration_mins,calories_burned,avg_hr,date")
        .eq("user_id", user_id)
        .gte("date", since)
        .execute()
        .data or []
    )
    metrics = (
        db.table("health_metrics")
        .select("date,sleep_hours,hrv,stress_level,body_battery,resting_hr")
        .eq("user_id", user_id)
        .gte("date", since)
        .execute()
        .data or []
    )
    foods = (
        db.table("food_logs")
        .select("calories,protein_g,carbs_g,fat_g,date")
        .eq("user_id", user_id)
        .gte("date", since)
        .execute()
        .data or []
    )
    profile = (
        db.table("profiles")
        .select("goal,weight_kg,height_cm,sex")
        .eq("id", user_id)
        .single()
        .execute()
        .data or {}
    )

    def avg(rows, key):
        vals = [r.get(key) for r in rows if r.get(key) is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    total_burned = sum(a.get("calories_burned") or 0 for a in activities)
    total_consumed = sum(f.get("calories") or 0 for f in foods)
    days = max(len({f["date"] for f in foods} | {a["date"] for a in activities}), 1)

    return {
        "goal": profile.get("goal") or "performance",
        "weight_kg": profile.get("weight_kg"),
        "height_cm": profile.get("height_cm"),
        "sex": profile.get("sex"),
        "activity_count_7d": len(activities),
        "avg_sleep_hours": avg(metrics, "sleep_hours"),
        "avg_hrv": avg(metrics, "hrv"),
        "avg_stress": avg(metrics, "stress_level"),
        "avg_body_battery": avg(metrics, "body_battery"),
        "avg_resting_hr": avg(metrics, "resting_hr"),
        "avg_protein_g": round(sum(f.get("protein_g") or 0 for f in foods) / days, 1) if foods else None,
        "avg_carbs_g": round(sum(f.get("carbs_g") or 0 for f in foods) / days, 1) if foods else None,
        "avg_fat_g": round(sum(f.get("fat_g") or 0 for f in foods) / days, 1) if foods else None,
        "avg_net_calories": round((total_consumed - total_burned) / days, 0),
    }


@router.post("/suggest")
async def generate(user: CurrentUser = Depends(get_current_user), db=Depends(get_db)):
    context = _build_context(db, user.id)
    output = await claude.generate_suggestions(context)

    row = {
        "user_id": user.id,
        "context_json": context,
        "suggestions": output.get("suggestions", []),
        "status": "pending",
    }
    res = db.table("supplement_suggestions").insert(row).execute()
    record = res.data[0] if res.data else row
    record["summary"] = output.get("summary", "")
    return record


@router.get("/suggestions")
def list_suggestions(user: CurrentUser = Depends(get_current_user), db=Depends(get_db)):
    res = (
        db.table("supplement_suggestions")
        .select("*")
        .eq("user_id", user.id)
        .order("generated_at", desc=True)
        .limit(20)
        .execute()
    )
    return res.data


@router.patch("/suggestions/{suggestion_id}")
def update_suggestion(
    suggestion_id: str,
    payload: SuggestionAction,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    update: dict[str, Any] = {"status": payload.status}
    if payload.status == "accepted":
        update["accepted_at"] = now
        if payload.accepted_items is not None:
            update["accepted_items"] = payload.accepted_items
    else:
        update["dismissed_at"] = now

    res = (
        db.table("supplement_suggestions")
        .update(update)
        .eq("id", suggestion_id)
        .eq("user_id", user.id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Suggestion not found")
    return res.data[0]
