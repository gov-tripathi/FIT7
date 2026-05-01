"""Open Food Facts client — free, no API key."""
from __future__ import annotations

from typing import Any

import httpx

BASE = "https://world.openfoodfacts.org"
TIMEOUT = httpx.Timeout(8.0, connect=3.0)


def _normalize(product: dict[str, Any]) -> dict[str, Any]:
    n = product.get("nutriments", {}) or {}
    return {
        "openfoodfacts_id": product.get("code") or product.get("_id"),
        "food_name": product.get("product_name") or product.get("generic_name") or "Unknown",
        "brand": (product.get("brands") or "").split(",")[0].strip() or None,
        "barcode": product.get("code"),
        "image_url": product.get("image_front_small_url") or product.get("image_url"),
        # Per-100g macros
        "calories_per_100g": n.get("energy-kcal_100g") or n.get("energy-kcal"),
        "protein_g_per_100g": n.get("proteins_100g"),
        "carbs_g_per_100g": n.get("carbohydrates_100g"),
        "fat_g_per_100g": n.get("fat_100g"),
        "fiber_g_per_100g": n.get("fiber_100g"),
        "sugar_g_per_100g": n.get("sugars_100g"),
        "sodium_mg_per_100g": (n.get("sodium_100g") or 0) * 1000 if n.get("sodium_100g") else None,
    }


async def search(query: str, page_size: int = 20) -> list[dict[str, Any]]:
    if not query.strip():
        return []
    params = {
        "search_terms": query,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": page_size,
        "fields": (
            "code,product_name,generic_name,brands,image_front_small_url,image_url,"
            "nutriments"
        ),
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.get(f"{BASE}/cgi/search.pl", params=params)
        r.raise_for_status()
        data = r.json()
    return [_normalize(p) for p in data.get("products", []) if p.get("product_name")]


async def by_barcode(barcode: str) -> dict[str, Any] | None:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.get(f"{BASE}/api/v2/product/{barcode}.json")
        if r.status_code != 200:
            return None
        data = r.json()
    if data.get("status") != 1:
        return None
    return _normalize(data["product"])
