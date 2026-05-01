from datetime import date as date_cls, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..deps import CurrentUser, get_current_user, get_db

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


class DailyTargetPayload(BaseModel):
    calories_target: int
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    water_ml: Optional[int] = 2500
    notes: Optional[str] = None


@router.get("/summary")
def daily_summary(
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    today = date_cls.today().isoformat()
    res = (
        db.table("daily_calorie_summary")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", today)
        .execute()
    )
    if res.data:
        return res.data[0]
    return {
        "user_id": user.id,
        "date": today,
        "calories_consumed": 0,
        "calories_burned": 0,
        "calories_target": 0,
        "protein_g": 0,
        "carbs_g": 0,
        "fat_g": 0,
        "net_calories": 0,
    }


@router.get("/weekly")
def weekly_summary(
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    since = (date_cls.today() - timedelta(days=7)).isoformat()
    res = (
        db.table("daily_calorie_summary")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date")
        .execute()
    )
    return res.data


@router.get("/targets")
def current_target(
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("daily_targets")
        .select("*")
        .eq("user_id", user.id)
        .order("effective_from", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


@router.post("/targets")
def set_target(
    payload: DailyTargetPayload,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    row = payload.model_dump()
    row["user_id"] = user.id
    row["effective_from"] = date_cls.today().isoformat()
    res = (
        db.table("daily_targets")
        .upsert(row, on_conflict="user_id,effective_from")
        .execute()
    )
    return res.data[0] if res.data else {}
