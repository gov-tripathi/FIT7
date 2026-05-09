"""Direct cookie-auth client for Garmin Connect's internal REST endpoints.

Uses the session captured by `garmin_browser.interactive_login` — a real
browser solved the reCAPTCHA once, and we piggyback on those cookies.
These are the same endpoints Garmin Connect's web UI calls internally, so
they're JSON and stable enough to be worth depending on.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

import httpx

from . import garmin_browser

logger = logging.getLogger(__name__)


BASE = "https://connect.garmin.com"

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)

_DEFAULT_HEADERS = {
    "User-Agent": _UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://connect.garmin.com/modern/",
    "NK": "NT",
    "X-Requested-With": "XMLHttpRequest",
}


class GarminAuthExpired(Exception):
    """Cookie session is stale — user must re-authenticate in the browser."""


class GarminApiError(Exception):
    """Garmin returned a non-auth failure."""


class GarminWebClient:
    """Thin wrapper over httpx.Client preloaded with browser session cookies.

    All methods raise `GarminAuthExpired` on 401/403, `GarminApiError` otherwise.
    """

    def __init__(self, user_id: str):
        state = garmin_browser.load_storage_state(user_id)
        if not state:
            raise GarminAuthExpired(
                "No Garmin browser session on disk. Run the browser login."
            )

        cookie_jar: dict[str, str] = {}
        for c in state.get("cookies") or []:
            dom = (c.get("domain") or "").lstrip(".")
            if not dom.endswith("garmin.com"):
                continue
            name = c.get("name")
            value = c.get("value")
            if not name or value is None:
                continue
            cookie_jar[name] = value

        if not cookie_jar:
            raise GarminAuthExpired("Stored session has no Garmin cookies.")

        self.user_id = user_id
        self.client = httpx.Client(
            base_url=BASE,
            headers=_DEFAULT_HEADERS,
            cookies=cookie_jar,
            timeout=httpx.Timeout(30.0, connect=15.0),
            follow_redirects=False,
            verify=True,
        )
        self._display_name: str | None = None

    def close(self) -> None:
        try:
            self.client.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    def _get(self, path: str, **params) -> Any:
        r = self.client.get(path, params=params or None)
        if r.status_code in (401, 403):
            raise GarminAuthExpired(
                f"Garmin rejected cookie auth ({r.status_code}). Re-login needed."
            )
        if r.status_code == 302 or r.status_code == 301:
            # A redirect to SSO means cookies have lapsed.
            loc = r.headers.get("location", "")
            if "sso.garmin.com" in loc or "signin" in loc:
                raise GarminAuthExpired(
                    "Garmin session expired. Please re-connect in the browser."
                )
            raise GarminApiError(f"Unexpected redirect: {loc}")
        if r.status_code >= 400:
            raise GarminApiError(
                f"Garmin {r.request.method} {path} failed: {r.status_code} {r.text[:200]}"
            )
        try:
            return r.json()
        except Exception as e:
            raise GarminApiError(f"Garmin returned non-JSON from {path}: {e}")

    # ───────────────────── profile ─────────────────────
    def user_settings(self) -> dict[str, Any]:
        return self._get("/userprofile-service/userprofile/user-settings") or {}

    def social_profile(self) -> dict[str, Any]:
        return self._get("/userprofile-service/socialProfile") or {}

    def display_name(self) -> str:
        if self._display_name:
            return self._display_name
        sp = self.social_profile()
        name = sp.get("displayName") or sp.get("userName") or ""
        self._display_name = name
        return name

    # ───────────────────── activities ─────────────────────
    def activities(self, limit: int = 30, start: int = 0) -> list[dict[str, Any]]:
        return (
            self._get(
                "/activitylist-service/activities/search/activities",
                start=start,
                limit=limit,
            )
            or []
        )

    # ───────────────────── daily wellness ─────────────────────
    def daily_stats(self, d: date) -> dict[str, Any]:
        dn = self.display_name()
        if not dn:
            return {}
        return (
            self._get(
                f"/usersummary-service/usersummary/daily/{dn}",
                calendarDate=d.isoformat(),
            )
            or {}
        )

    def sleep(self, d: date) -> dict[str, Any]:
        dn = self.display_name()
        if not dn:
            return {}
        return (
            self._get(
                f"/wellness-service/wellness/dailySleepData/{dn}",
                date=d.isoformat(),
                nonSleepBufferMinutes=60,
            )
            or {}
        )

    def hrv(self, d: date) -> dict[str, Any]:
        return self._get(f"/hrv-service/hrv/{d.isoformat()}") or {}

    def body_composition(self, start: date, end: date) -> dict[str, Any]:
        return (
            self._get(
                "/weight-service/weight/dateRange",
                startDate=start.isoformat(),
                endDate=end.isoformat(),
            )
            or {}
        )

    # ───────────────────── aggregate pull ─────────────────────
    def pull_all(self, user_id: str, days: int = 30) -> dict[str, Any]:
        """Return activities + daily metrics for the last N days, in the
        shape our DB upsert expects. Safe to run repeatedly — upserts are
        keyed on (user_id, date) and garmin_id."""
        today = date.today()
        start = today - timedelta(days=days)

        raw_acts = self.activities(limit=days * 2)
        activities: list[dict[str, Any]] = []
        for a in raw_acts:
            try:
                activities.append(
                    {
                        "garmin_id": a.get("activityId"),
                        "user_id": user_id,
                        "date": (a.get("startTimeLocal") or "")[:10]
                        or today.isoformat(),
                        "started_at": a.get("startTimeGMT"),
                        "type": (a.get("activityType") or {}).get("typeKey") or "other",
                        "name": a.get("activityName"),
                        "distance_km": round((a.get("distance") or 0) / 1000, 2),
                        "duration_mins": round((a.get("duration") or 0) / 60, 1),
                        "calories_burned": int(a.get("calories") or 0),
                        "avg_hr": int(a["averageHR"]) if a.get("averageHR") else None,
                        "max_hr": int(a["maxHR"]) if a.get("maxHR") else None,
                        "elevation_m": a.get("elevationGain"),
                        "vo2_max": a.get("vO2MaxValue"),
                        "training_effect": a.get("aerobicTrainingEffect"),
                        "raw_data": None,
                    }
                )
            except Exception as e:
                logger.warning("Skipping malformed activity: %s", e)

        metrics: list[dict[str, Any]] = []
        for i in range(days + 1):
            d = start + timedelta(days=i)
            stats: dict[str, Any] = {}
            sleep_data: dict[str, Any] = {}
            hrv_val = None
            try:
                stats = self.daily_stats(d)
            except GarminAuthExpired:
                raise
            except Exception:
                pass
            try:
                sleep_data = (self.sleep(d) or {}).get("dailySleepDTO") or {}
            except GarminAuthExpired:
                raise
            except Exception:
                pass
            try:
                hrv_raw = self.hrv(d) or {}
                hrv_val = (hrv_raw.get("hrvSummary") or {}).get("lastNightAvg")
            except GarminAuthExpired:
                raise
            except Exception:
                pass

            sleep_score = None
            ss = sleep_data.get("sleepScores")
            if isinstance(ss, dict):
                sleep_score = (ss.get("overall") or {}).get("value")

            metrics.append(
                {
                    "user_id": user_id,
                    "date": d.isoformat(),
                    "sleep_hours": round(
                        (sleep_data.get("sleepTimeSeconds") or 0) / 3600, 1
                    ),
                    "sleep_score": sleep_score,
                    "deep_sleep_hrs": round(
                        (sleep_data.get("deepSleepSeconds") or 0) / 3600, 1
                    ),
                    "rem_sleep_hrs": round(
                        (sleep_data.get("remSleepSeconds") or 0) / 3600, 1
                    ),
                    "hrv": hrv_val,
                    "resting_hr": stats.get("restingHeartRate"),
                    "stress_level": stats.get("averageStressLevel"),
                    "body_battery": stats.get("bodyBatteryMostRecentValue"),
                    "vo2_max": stats.get("vO2MaxValue"),  # backfilled below
                    "steps": stats.get("totalSteps"),
                    "active_mins": round((stats.get("activeSeconds") or 0) / 60) or None,
                }
            )

        # Backfill vo2_max from same-day activities when stats endpoint omits it.
        act_vo2_by_date: dict[str, float] = {}
        for a in activities:
            v = a.get("vo2_max")
            if v and a.get("date"):
                act_vo2_by_date[a["date"]] = float(v)
        for m in metrics:
            if m["vo2_max"] is None and m["date"] in act_vo2_by_date:
                m["vo2_max"] = act_vo2_by_date[m["date"]]

        logger.info(
            "Garmin cookie sync: %d activities, %d metric days for user=%s",
            len(activities),
            len(metrics),
            user_id,
        )
        return {"activities": activities, "metrics": metrics, "source": "garmin"}

    # ───────────────────── profile details (name/bio/sex) ─────────────────────
    def profile_fields(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        try:
            sp = self.social_profile() or {}
            dn = sp.get("fullName") or sp.get("displayName")
            if dn:
                out["display_name"] = dn.strip()
        except Exception:
            pass

        try:
            settings = self.user_settings() or {}
            ud = settings.get("userData") or {}
            gender = (ud.get("gender") or "").upper()
            if gender == "MALE":
                out["sex"] = "male"
            elif gender == "FEMALE":
                out["sex"] = "female"
            elif gender:
                out["sex"] = "other"
            h = ud.get("height")
            if h:
                try:
                    out["height_cm"] = round(float(h), 1)
                except Exception:
                    pass
            w = ud.get("weight")
            if w:
                try:
                    out["weight_kg"] = round(float(w) / 1000.0, 1)
                except Exception:
                    pass
            bd = ud.get("birthDate")
            if bd and isinstance(bd, str) and len(bd) >= 4:
                try:
                    out["birth_year"] = int(bd[:4])
                except Exception:
                    pass
        except Exception:
            pass

        try:
            today = date.today()
            bc = self.body_composition(today - timedelta(days=60), today) or {}
            weighins = bc.get("dateWeightList") or []
            if weighins:
                latest = max(weighins, key=lambda x: x.get("date", ""))
                w = latest.get("weight")
                if w:
                    out["weight_kg"] = round(float(w) / 1000.0, 1)
        except Exception:
            pass
        return out
