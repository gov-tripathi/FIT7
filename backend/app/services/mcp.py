"""MCP e-commerce client.

Phase 4 is MCP-agnostic per the PRD — this module exposes a stable Python
interface that either proxies to a configured MCP server URL or serves
deterministic stub data.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)


_STUB_CATALOG = [
    {
        "product_id": "whey-iso-1kg",
        "name": "Whey Protein Isolate — Vanilla 1kg",
        "category": "protein",
        "price": 39.90,
        "currency": "USD",
        "image_url": "https://images.unsplash.com/photo-1593095948071-474c06429d7e?w=400",
        "description": "25g protein per serving, low-lactose isolate.",
    },
    {
        "product_id": "creatine-mono-300g",
        "name": "Creatine Monohydrate 300g",
        "category": "recovery",
        "price": 19.50,
        "currency": "USD",
        "image_url": "https://images.unsplash.com/photo-1579722821273-0f6c1b5d0b61?w=400",
        "description": "Micronised, unflavoured, 60 servings.",
    },
    {
        "product_id": "mag-glycinate-120",
        "name": "Magnesium Glycinate 400mg — 120 caps",
        "category": "sleep",
        "price": 24.00,
        "currency": "USD",
        "image_url": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400",
        "description": "Chelated for high bio-availability; gentle on stomach.",
    },
    {
        "product_id": "electrolytes-30pk",
        "name": "Electrolyte Powder — 30 sticks",
        "category": "energy",
        "price": 28.00,
        "currency": "USD",
        "image_url": "https://images.unsplash.com/photo-1622484212850-eb596d769edc?w=400",
        "description": "Sodium + potassium + magnesium, zero sugar.",
    },
    {
        "product_id": "ashwagandha-60",
        "name": "Ashwagandha KSM-66 — 60 caps",
        "category": "sleep",
        "price": 22.00,
        "currency": "USD",
        "image_url": "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400",
        "description": "Standardised KSM-66 extract, 600mg daily dose.",
    },
    {
        "product_id": "b-complex-90",
        "name": "B-Complex Methylated — 90 caps",
        "category": "energy",
        "price": 18.50,
        "currency": "USD",
        "image_url": "https://images.unsplash.com/photo-1550572017-edd951b55104?w=400",
        "description": "Active B12 (methylcobalamin) and B9 (folate).",
    },
]


async def search_products(query: str, category: str | None = None) -> list[dict[str, Any]]:
    s = get_settings()
    q = (query or "").lower()
    if s.MCP_SERVER_URL:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    f"{s.MCP_SERVER_URL}/tools/search_products",
                    json={"query": query, "category": category},
                )
                r.raise_for_status()
                return r.json().get("products", [])
        except Exception as e:  # pragma: no cover
            logger.warning("MCP search failed, falling back to stub: %s", e)

    results = _STUB_CATALOG
    if category:
        results = [p for p in results if p["category"] == category]
    if q:
        results = [p for p in results if q in p["name"].lower() or q in p["description"].lower()]
    return results[:10]


async def place_order(
    user_id: str,
    items: list[dict[str, Any]],
    address: dict[str, Any],
) -> dict[str, Any]:
    s = get_settings()
    if s.MCP_SERVER_URL:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    f"{s.MCP_SERVER_URL}/tools/place_order",
                    json={"user_id": user_id, "items": items, "address": address},
                )
                r.raise_for_status()
                return r.json()
        except Exception as e:  # pragma: no cover
            logger.warning("MCP order failed, falling back to stub: %s", e)

    subtotal = sum(i.get("unit_price", 0) * i.get("quantity", 1) for i in items)
    shipping = 0 if subtotal > 50 else 4.99
    return {
        "mcp_order_id": f"stub-{user_id[:8]}-{int(subtotal*100)}",
        "mcp_provider": "stub",
        "subtotal": round(subtotal, 2),
        "shipping": shipping,
        "total": round(subtotal + shipping, 2),
        "currency": "USD",
        "status": "confirmed",
    }
