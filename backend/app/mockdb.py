"""In-memory Supabase-lookalike for guest / no-config mode.

Implements just enough of the PostgREST fluent API that our routers exercise:
  .table(name).select("*").eq(col, val).order(col, desc=True).limit(n).execute()
  .table(name).insert(row).execute()
  .table(name).upsert(rows, on_conflict="a,b").execute()
  .table(name).update(row).eq(col, val).execute()
  .table(name).delete().eq(col, val).execute()
  .table(name).select("*").eq(col, val).single().execute()

Plus computed handling for the two views from supabase_setup.sql:
  daily_calorie_summary, weekly_activity_summary.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any


@dataclass
class _Resp:
    data: Any


@dataclass
class _Table:
    rows: list[dict[str, Any]] = field(default_factory=list)


class _Query:
    def __init__(self, store: "MockDB", table_name: str) -> None:
        self._store = store
        self._table_name = table_name
        self._table = store._tables.setdefault(table_name, _Table())
        self._op = "select"
        self._filters: list[tuple[str, str, Any]] = []
        self._order: list[tuple[str, bool]] = []
        self._limit: int | None = None
        self._single = False
        self._payload: Any = None
        self._conflict_cols: list[str] = []

    # -- operation selectors ------------------------------------------------
    def select(self, *_args: Any, **_kw: Any) -> "_Query":
        self._op = "select"
        return self

    def insert(self, data: Any) -> "_Query":
        self._op = "insert"
        self._payload = data
        return self

    def upsert(self, data: Any, on_conflict: str | None = None) -> "_Query":
        self._op = "upsert"
        self._payload = data
        self._conflict_cols = [c.strip() for c in (on_conflict or "").split(",") if c.strip()]
        return self

    def update(self, data: dict[str, Any]) -> "_Query":
        self._op = "update"
        self._payload = data
        return self

    def delete(self) -> "_Query":
        self._op = "delete"
        return self

    # -- filters ------------------------------------------------------------
    def eq(self, col: str, val: Any) -> "_Query":
        self._filters.append(("eq", col, val))
        return self

    def gte(self, col: str, val: Any) -> "_Query":
        self._filters.append(("gte", col, val))
        return self

    def lte(self, col: str, val: Any) -> "_Query":
        self._filters.append(("lte", col, val))
        return self

    def lt(self, col: str, val: Any) -> "_Query":
        self._filters.append(("lt", col, val))
        return self

    def gt(self, col: str, val: Any) -> "_Query":
        self._filters.append(("gt", col, val))
        return self

    def order(self, col: str, desc: bool = False) -> "_Query":
        self._order.append((col, desc))
        return self

    def limit(self, n: int) -> "_Query":
        self._limit = n
        return self

    def single(self) -> "_Query":
        self._single = True
        return self

    # -- apply filters ------------------------------------------------------
    def _match(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out = rows
        for op, col, val in self._filters:
            if op == "eq":
                out = [r for r in out if r.get(col) == val]
            elif op == "gte":
                out = [r for r in out if _cmp(r.get(col), val) >= 0]
            elif op == "lte":
                out = [r for r in out if _cmp(r.get(col), val) <= 0]
            elif op == "gt":
                out = [r for r in out if _cmp(r.get(col), val) > 0]
            elif op == "lt":
                out = [r for r in out if _cmp(r.get(col), val) < 0]
        return out

    # -- execute ------------------------------------------------------------
    def execute(self) -> _Resp:
        if self._table_name in _VIEWS and self._op == "select":
            rows = _VIEWS[self._table_name](self._store)
            return self._finalize_select(rows)

        if self._op == "select":
            return self._finalize_select(list(self._table.rows))

        if self._op == "insert":
            rows = _as_list(self._payload)
            inserted = [self._inject_id(r) for r in rows]
            self._table.rows.extend(inserted)
            return _Resp(inserted)

        if self._op == "upsert":
            rows = _as_list(self._payload)
            result: list[dict[str, Any]] = []
            for row in rows:
                merged = self._inject_id(row)
                if self._conflict_cols:
                    found = False
                    for i, existing in enumerate(self._table.rows):
                        if all(existing.get(c) == merged.get(c) for c in self._conflict_cols):
                            self._table.rows[i] = {**existing, **merged}
                            result.append(self._table.rows[i])
                            found = True
                            break
                    if not found:
                        self._table.rows.append(merged)
                        result.append(merged)
                else:
                    self._table.rows.append(merged)
                    result.append(merged)
            return _Resp(result)

        if self._op == "update":
            matched = self._match(self._table.rows)
            for r in matched:
                r.update(self._payload)
            return _Resp(matched)

        if self._op == "delete":
            matched_ids = {id(r) for r in self._match(self._table.rows)}
            kept = [r for r in self._table.rows if id(r) not in matched_ids]
            self._table.rows = kept
            return _Resp([])

        return _Resp([])

    def _finalize_select(self, rows: list[dict[str, Any]]) -> _Resp:
        out = self._match(rows)
        for col, desc in self._order:
            out = sorted(out, key=lambda r: _sort_key(r.get(col)), reverse=desc)
        if self._limit is not None:
            out = out[: self._limit]
        if self._single:
            return _Resp(out[0] if out else None)
        return _Resp(out)

    def _inject_id(self, row: dict[str, Any]) -> dict[str, Any]:
        row = dict(row)
        row.setdefault("id", str(uuid.uuid4()))
        row.setdefault("created_at", datetime.utcnow().isoformat() + "Z")
        return row


def _cmp(a: Any, b: Any) -> int:
    if a is None:
        a = ""
    if b is None:
        b = ""
    return (a > b) - (a < b)


def _sort_key(v: Any) -> tuple[int, Any]:
    # None values sort last regardless of desc
    return (0, v) if v is not None else (1, "")


def _as_list(x: Any) -> list[dict[str, Any]]:
    if isinstance(x, list):
        return x
    return [x]


# ---------------------------------------------------------------------------
# Simple view implementations
# ---------------------------------------------------------------------------
def _daily_calorie_summary(store: "MockDB") -> list[dict[str, Any]]:
    foods = store._tables.get("food_logs", _Table()).rows
    acts = store._tables.get("activities", _Table()).rows
    targets = store._tables.get("daily_targets", _Table()).rows

    by_date: dict[tuple[str, str], dict[str, Any]] = {}
    for f in foods:
        key = (f.get("user_id"), f.get("date"))
        row = by_date.setdefault(
            key,
            {
                "user_id": key[0],
                "date": key[1],
                "calories_consumed": 0,
                "calories_burned": 0,
                "calories_target": 0,
                "protein_g": 0,
                "carbs_g": 0,
                "fat_g": 0,
            },
        )
        row["calories_consumed"] += f.get("calories") or 0
        row["protein_g"] += f.get("protein_g") or 0
        row["carbs_g"] += f.get("carbs_g") or 0
        row["fat_g"] += f.get("fat_g") or 0

    for a in acts:
        key = (a.get("user_id"), a.get("date"))
        row = by_date.setdefault(
            key,
            {
                "user_id": key[0],
                "date": key[1],
                "calories_consumed": 0,
                "calories_burned": 0,
                "calories_target": 0,
                "protein_g": 0,
                "carbs_g": 0,
                "fat_g": 0,
            },
        )
        row["calories_burned"] += a.get("calories_burned") or 0

    for row in by_date.values():
        applicable = [
            t for t in targets
            if t.get("user_id") == row["user_id"]
            and (t.get("effective_from") or "") <= row["date"]
        ]
        if applicable:
            latest = max(applicable, key=lambda t: t.get("effective_from") or "")
            row["calories_target"] = latest.get("calories_target") or 0
        row["net_calories"] = row["calories_consumed"] - row["calories_burned"]

    return list(by_date.values())


def _weekly_activity_summary(store: "MockDB") -> list[dict[str, Any]]:
    acts = store._tables.get("activities", _Table()).rows
    buckets: dict[tuple[str, str], dict[str, Any]] = {}
    for a in acts:
        d = a.get("date")
        if not d:
            continue
        dt = date.fromisoformat(d) if isinstance(d, str) else d
        monday = (dt - timedelta(days=dt.weekday())).isoformat()
        key = (a.get("user_id"), monday)
        row = buckets.setdefault(
            key,
            {
                "user_id": key[0],
                "week_start": monday,
                "activity_count": 0,
                "total_distance_km": 0.0,
                "total_duration_mins": 0,
                "total_calories_burned": 0,
                "avg_heart_rate": None,
                "_hr_vals": [],
            },
        )
        row["activity_count"] += 1
        row["total_distance_km"] += a.get("distance_km") or 0
        row["total_duration_mins"] += a.get("duration_mins") or 0
        row["total_calories_burned"] += a.get("calories_burned") or 0
        if a.get("avg_hr"):
            row["_hr_vals"].append(a["avg_hr"])

    out = []
    for row in buckets.values():
        hr = row.pop("_hr_vals")
        row["avg_heart_rate"] = round(sum(hr) / len(hr)) if hr else None
        row["total_distance_km"] = round(row["total_distance_km"], 1)
        row["total_duration_mins"] = round(row["total_duration_mins"])
        out.append(row)
    return out


_VIEWS = {
    "daily_calorie_summary": _daily_calorie_summary,
    "weekly_activity_summary": _weekly_activity_summary,
}


class MockDB:
    """A minimal, process-wide, in-memory stand-in for a Supabase client."""

    def __init__(self) -> None:
        self._tables: dict[str, _Table] = {}

    def table(self, name: str) -> _Query:
        return _Query(self, name)


# Singleton shared across requests for the lifetime of the process.
_instance: MockDB | None = None


def get_mock_db() -> MockDB:
    global _instance
    if _instance is None:
        _instance = MockDB()
        _seed_default_profile(_instance)
    return _instance


def _seed_default_profile(db: MockDB) -> None:
    """Seed a guest profile so /profile returns something sensible."""
    db.table("profiles").insert(
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "display_name": "Guest",
            "goal": "performance",
            "garmin_enabled": False,
        }
    ).execute()
    db.table("daily_targets").insert(
        {
            "user_id": "00000000-0000-0000-0000-000000000001",
            "effective_from": date.today().isoformat(),
            "calories_target": 2400,
            "protein_g": 180,
            "carbs_g": 250,
            "fat_g": 75,
            "water_ml": 2500,
        }
    ).execute()
