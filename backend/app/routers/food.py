from __future__ import annotations

from datetime import date as date_cls
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..deps import CurrentUser, get_current_user, get_db
from ..services import openfoodfacts

router = APIRouter(prefix="/food", tags=["food"])


MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout")


class FoodLogCreate(BaseModel):
    meal_type: str = Field(pattern="^(breakfast|lunch|dinner|snack|pre_workout|post_workout)$")
    food_name: str
    portion_g: float = 100
    calories: int
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None
    sugar_g: Optional[float] = None
    sodium_mg: Optional[float] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    openfoodfacts_id: Optional[str] = None


@router.get("/search")
async def search_food(q: str = Query(..., min_length=2)):
    return await openfoodfacts.search(q)


@router.get("/barcode/{barcode}")
async def lookup_barcode(barcode: str):
    product = await openfoodfacts.by_barcode(barcode)
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@router.post("/log")
def log_food(
    payload: FoodLogCreate,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    row = payload.model_dump()
    row["user_id"] = user.id
    res = db.table("food_logs").insert(row).execute()
    return res.data[0] if res.data else {}


@router.get("/logs")
def list_logs(
    day: Optional[date_cls] = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    q = db.table("food_logs").select("*").eq("user_id", user.id)
    if day:
        q = q.eq("date", day.isoformat())
    res = q.order("logged_at", desc=True).limit(200).execute()
    return res.data


@router.delete("/logs/{log_id}")
def delete_log(
    log_id: str,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("food_logs").delete().eq("id", log_id).eq("user_id", user.id).execute()
    return {"ok": True}
