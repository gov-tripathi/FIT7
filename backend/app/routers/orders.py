from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..deps import CurrentUser, get_current_user, get_db
from ..services import mcp

router = APIRouter(prefix="/orders", tags=["orders"])


class Address(BaseModel):
    line1: str
    line2: Optional[str] = None
    city: str
    state: Optional[str] = None
    zip: str
    country: str = "US"


class OrderItem(BaseModel):
    product_id: str
    name: str
    quantity: int = 1
    unit_price: float
    image_url: Optional[str] = None


class PlaceOrderRequest(BaseModel):
    items: list[OrderItem]
    delivery_name: str
    delivery_address: Address
    suggestion_id: Optional[str] = None
    meal_plan_id: Optional[str] = None


@router.get("/search")
async def search(q: str = Query("", alias="q"), category: Optional[str] = None):
    return await mcp.search_products(q, category)


@router.post("/place")
async def place(
    payload: PlaceOrderRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    mcp_items = [i.model_dump() for i in payload.items]
    result = await mcp.place_order(user.id, mcp_items, payload.delivery_address.model_dump())

    items_with_totals: list[dict[str, Any]] = []
    for i in payload.items:
        items_with_totals.append(
            {
                "product_id": i.product_id,
                "name": i.name,
                "quantity": i.quantity,
                "unit_price": i.unit_price,
                "total_price": round(i.unit_price * i.quantity, 2),
                "image_url": i.image_url,
            }
        )

    row = {
        "user_id": user.id,
        "suggestion_id": payload.suggestion_id,
        "meal_plan_id": payload.meal_plan_id,
        "mcp_order_id": result.get("mcp_order_id"),
        "mcp_provider": result.get("mcp_provider"),
        "items": items_with_totals,
        "subtotal": result.get("subtotal"),
        "shipping": result.get("shipping"),
        "total": result.get("total"),
        "currency": result.get("currency", "USD"),
        "delivery_name": payload.delivery_name,
        "delivery_address": payload.delivery_address.model_dump(),
        "status": "confirmed",
    }
    res = db.table("orders").insert(row).execute()
    order = res.data[0] if res.data else row

    if payload.suggestion_id and order.get("id"):
        db.table("supplement_suggestions").update(
            {"status": "ordered", "order_id": order["id"]}
        ).eq("id", payload.suggestion_id).eq("user_id", user.id).execute()

    return order


@router.get("")
def list_orders(user: CurrentUser = Depends(get_current_user), db=Depends(get_db)):
    res = (
        db.table("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("placed_at", desc=True)
        .limit(50)
        .execute()
    )
    return res.data
