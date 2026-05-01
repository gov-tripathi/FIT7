from __future__ import annotations

from datetime import date as date_cls, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..deps import CurrentUser, get_current_user, get_db
from ..services import claude

router = APIRouter(prefix="/planner", tags=["planner"])


class PlanRequest(BaseModel):
    calorie_target: int | None = None
    preferences: list[str] = []


def _monday_of_this_week() -> str:
    today = date_cls.today()
    return (today - timedelta(days=today.weekday())).isoformat()


@router.post("/generate")
async def generate_plan(
    payload: PlanRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    # Pull goal + calorie target defaults
    profile = (
        db.table("profiles")
        .select("goal")
        .eq("id", user.id)
        .single()
        .execute()
        .data or {}
    )
    goal = profile.get("goal") or "performance"

    calorie_target = payload.calorie_target
    if not calorie_target:
        t = (
            db.table("daily_targets")
            .select("calories_target")
            .eq("user_id", user.id)
            .order("effective_from", desc=True)
            .limit(1)
            .execute()
            .data
        )
        calorie_target = (t[0]["calories_target"] if t else 2200)

    plan_output = await claude.generate_meal_plan(calorie_target, goal, payload.preferences)

    row: dict[str, Any] = {
        "user_id": user.id,
        "week_start": _monday_of_this_week(),
        "goal": goal,
        "calorie_target": calorie_target,
        "plan_json": plan_output.get("plan", {}),
        "shopping_list": plan_output.get("shopping_list", {}),
        "is_active": True,
    }
    res = (
        db.table("meal_plans")
        .upsert(row, on_conflict="user_id,week_start")
        .execute()
    )
    return res.data[0] if res.data else row


@router.get("/current")
def get_current_plan(
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("meal_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_start", _monday_of_this_week())
        .execute()
    )
    return res.data[0] if res.data else None
