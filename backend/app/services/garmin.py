"""Garmin Connect sync service.

Strategy:
  * If the user has configured Garmin credentials → hit the real Garmin
    Connect API. Errors are surfaced, not swallowed.
  * If they haven't → return deterministic mock data so the UI still works
    in guest/demo mode.

macOS + corporate networks frequently inject a TLS-inspecting root CA
into the system keychain. Python's default cert bundle (certifi) does not
include it, so `ssl.CERTIFICATE_VERIFY_FAILED` shows up.
`truststore.inject_into_ssl()` tells Python to use the OS keychain, which
already trusts that CA — so real-Garmin sync works on these machines too.
"""
from __future__ import annotations

import logging
import os
import random
from datetime import date, datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

# Route Python SSL through the OS trust store so corporate / MITM root CAs
# installed in the macOS keychain are honored. Falls back silently on unsupported
# platforms.
try:
    import truststore  # type: ignore

    truststore.inject_into_ssl()
    logger.info("truststore active — using system CA trust store")
except Exception:  # pragma: no cover
    pass

# Also point certifi at itself as a secondary bundle, just in case.
try:
    import certifi  # type: ignore

    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except Exception:  # pragma: no cover
    pass


class GarminSyncError(Exception):
    """Raised when a real Garmin sync fails and we should surface the error."""


# ────────────────────────────────────────────────────────────
# Mock data (used only when no credentials are configured)
# ────────────────────────────────────────────────────────────
_TYPES = [
    "running",
    "cycling",
    "running",
    "walking",
    "strength_training",
    "running",
    "cycling",
    "swimming",
]


def _mock_activities(user_id: str, days: int = 30) -> list[dict[str, Any]]:
    rng = random.Random(user_id)
    out: list[dict[str, Any]] = []
    today = date.today()
    for i in range(days):
        n = rng.choices([0, 1, 2], weights=[1, 4, 1])[0]
        for slot in range(n):
            d = today - timedelta(days=i)
            t = _TYPES[(i + slot) % len(_TYPES)]
            if t == "strength_training":
                distance = 0.0
                duration = round(rng.uniform(35, 70), 1)
                avg_hr = rng.randint(100, 140)
            else:
                distance = round(rng.uniform(3, 22), 2)
                duration = round(rng.uniform(25, 105), 1)
                avg_hr = rng.randint(125, 168)
            out.append(
                {
                    "garmin_id": int(f"9{rng.randint(10_000_000, 99_999_999)}{i}{slot}"),
                    "user_id": user_id,
                    "date": d.isoformat(),
                    "started_at": datetime.combine(
                        d,
                        datetime.min.time().replace(hour=6 + slot * 6),
                        tzinfo=timezone.utc,
                    ).isoformat(),
                    "type": t,
                    "name": f"{t.replace('_', ' ').title()} Session",
                    "distance_km": distance,
                    "duration_mins": duration,
                    "calories_burned": int(duration * rng.uniform(8, 13)),
                    "avg_hr": avg_hr,
                    "max_hr": avg_hr + rng.randint(10, 30),
                    "avg_pace_min_km": round(60 / max(distance / (duration / 60), 1), 2)
                    if distance
                    else None,
                    "elevation_m": round(rng.uniform(10, 400), 0),
                    "vo2_max": round(46 + rng.uniform(-2, 6), 1),
                    "training_effect": round(rng.uniform(1.5, 4.5), 1),
                    "gpx_data": None,
                    "raw_data": None,
                }
            )
    return out


def _mock_metrics(user_id: str, days: int = 30) -> list[dict[str, Any]]:
    rng = random.Random(user_id + "metrics")
    out: list[dict[str, Any]] = []
    today = date.today()
    for i in range(days):
        d = today - timedelta(days=i)
        out.append(
            {
                "user_id": user_id,
                "date": d.isoformat(),
                "sleep_hours": round(rng.uniform(5.8, 8.5), 1),
                "sleep_score": rng.randint(55, 95),
                "deep_sleep_hrs": round(rng.uniform(0.8, 2.0), 1),
                "rem_sleep_hrs": round(rng.uniform(1.0, 2.5), 1),
                "hrv": rng.randint(45, 85),
                "resting_hr": rng.randint(48, 62),
                "stress_level": rng.randint(18, 62),
                "body_battery": rng.randint(35, 95),
                "vo2_max": round(45.5 + (days - i) * 0.05 + rng.uniform(-0.3, 0.3), 1),
                "steps": rng.randint(5000, 15000),
                "active_mins": rng.randint(20, 120),
            }
        )
    return out


def _mock_food_logs(user_id: str, days: int = 14) -> list[dict[str, Any]]:
    rng = random.Random(user_id + "food")
    meals = [
        ("breakfast", [
            ("Oats with berries", 380, 14, 58, 8),
            ("Scrambled eggs + toast", 420, 24, 30, 22),
            ("Greek yogurt parfait", 340, 22, 40, 9),
        ]),
        ("lunch", [
            ("Chicken quinoa bowl", 620, 45, 65, 18),
            ("Turkey sandwich", 540, 34, 58, 16),
            ("Salmon salad", 560, 38, 22, 32),
        ]),
        ("dinner", [
            ("Grilled salmon + sweet potato", 680, 42, 55, 24),
            ("Beef stir-fry with rice", 720, 46, 70, 22),
            ("Tofu curry with rice", 640, 28, 82, 20),
        ]),
        ("snack", [
            ("Apple + almond butter", 260, 6, 32, 14),
            ("Protein shake", 200, 30, 8, 4),
            ("Mixed nuts", 220, 7, 8, 19),
        ]),
    ]
    today = date.today()
    out: list[dict[str, Any]] = []
    for i in range(days):
        d = today - timedelta(days=i)
        for mt, options in meals:
            name, cal, p, c, f = rng.choice(options)
            hour = {"breakfast": 8, "lunch": 13, "dinner": 19, "snack": 16}[mt]
            out.append(
                {
                    "user_id": user_id,
                    "logged_at": datetime.combine(
                        d, datetime.min.time().replace(hour=hour), tzinfo=timezone.utc
                    ).isoformat(),
                    "date": d.isoformat(),
                    "meal_type": mt,
                    "food_name": name,
                    "portion_g": 200 if mt != "snack" else 100,
                    "calories": cal + rng.randint(-30, 30),
                    "protein_g": p,
                    "carbs_g": c,
                    "fat_g": f,
                }
            )
    return out


# ────────────────────────────────────────────────────────────
# Real Garmin Connect
# ────────────────────────────────────────────────────────────
# Session cache: avoid re-authenticating on every sync. Garmin SSO
# aggressively rate-limits login attempts (~5/hour); caching keeps us
# below that threshold and makes subsequent syncs instant.
_SESSION_CACHE_DIR = os.path.join(
    os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")),
    "fitfuel",
    "garmin-sessions",
)


def _session_path(user_id: str) -> str:
    os.makedirs(_SESSION_CACHE_DIR, exist_ok=True)
    return os.path.join(_SESSION_CACHE_DIR, user_id)


def has_garth_session(user_id: str) -> bool:
    """Return True if valid garth OAuth tokens are cached on disk."""
    session_dir = _session_path(user_id)
    return os.path.exists(os.path.join(session_dir, "oauth2_token.json"))


def direct_login(user_id: str, email: str, password: str) -> dict[str, Any]:
    """Log in via garth's direct HTTP OAuth flow (no browser required).

    Saves OAuth1 + OAuth2 tokens to disk so subsequent syncs reuse them
    without touching the SSO endpoint again.
    """
    import garth as garth_lib  # type: ignore

    c = garth_lib.Client()
    try:
        c.login(email, password)
    except Exception as e:
        msg = str(e)
        if "429" in msg or "Too Many Requests" in msg:
            raise GarminSyncError(
                "Garmin rate-limited this account. Wait 30–60 min then try again."
            )
        if "403" in msg or "Invalid" in msg or "credentials" in msg.lower():
            raise GarminSyncError(
                "Garmin rejected the credentials. Check email and password."
            )
        raise GarminSyncError(f"Garmin login failed: {e}")

    session_dir = _session_path(user_id)
    os.makedirs(session_dir, exist_ok=True)
    c.dump(session_dir)
    display_name = (c.profile or {}).get("displayName") or email
    logger.info("Garmin direct login OK for user=%s display_name=%s", user_id, display_name)
    return {"display_name": display_name, "username": c.username}


def _login(user_id: str, garmin_email: str | None, garmin_password: str | None):
    """Return an authenticated Garmin client, reusing cached garth tokens when possible."""
    from garminconnect import (  # type: ignore
        Garmin,
        GarminConnectAuthenticationError,
        GarminConnectConnectionError,
        GarminConnectTooManyRequestsError,
    )

    session_dir = _session_path(user_id)

    # Try cached garth tokens first — avoids SSO entirely.
    try:
        client = Garmin()
        client.login(session_dir)
        logger.info("Garmin: reused cached garth session for user=%s", user_id)
        return client
    except Exception as e:
        logger.info(
            "Garmin: cached session missing/expired (%s) — attempting fresh login",
            type(e).__name__,
        )

    if not (garmin_email and garmin_password):
        raise GarminSyncError(
            "Garmin session expired. Re-connect from Settings → Garmin."
        )

    # Fresh login — persist tokens for next time.
    try:
        client = Garmin(garmin_email, garmin_password)
        client.login()
        try:
            client.garth.dump(session_dir)
        except Exception as dump_err:
            logger.warning("Could not persist Garmin session: %s", dump_err)
        return client
    except GarminConnectAuthenticationError as e:
        raise GarminSyncError(
            f"Auth rejected by Garmin. Check email/password (MFA is not supported): {e}"
        )
    except GarminConnectTooManyRequestsError as e:
        raise GarminSyncError(
            "Garmin has rate-limited this account (too many login attempts). "
            f"Wait ~30–60 min and try again. Detail: {e}"
        )
    except GarminConnectConnectionError as e:
        raise GarminSyncError(
            f"Garmin connection failed. Detail: {e}"
        )
    except Exception as e:
        msg = str(e)
        if "429" in msg or "Too Many Requests" in msg:
            raise GarminSyncError(
                "Garmin rate-limited this account (HTTP 429). Wait ~30–60 min."
            )
        if "403" in msg:
            raise GarminSyncError(
                "Garmin refused the login (HTTP 403). MFA enabled or account locked."
            )
        raise GarminSyncError(f"Garmin login failed ({type(e).__name__}): {e}")


def _pull_real_data(
    user_id: str, garmin_email: str, garmin_password: str, days: int = 30
) -> dict[str, Any]:
    """Pull real data from Garmin Connect. Raises GarminSyncError on failure."""
    try:
        import garminconnect  # noqa: F401  type: ignore
    except Exception as e:
        raise GarminSyncError(f"garminconnect library not installed: {e}")

    client = _login(user_id, garmin_email, garmin_password)

    today = date.today()
    start = today - timedelta(days=days)

    try:
        raw_acts = client.get_activities_by_date(start.isoformat(), today.isoformat()) or []
    except Exception as e:
        raise GarminSyncError(f"Failed fetching activities: {e}")

    activities: list[dict[str, Any]] = []
    for a in raw_acts:
        try:
            activities.append(
                {
                    "garmin_id": a.get("activityId"),
                    "user_id": user_id,
                    "date": (a.get("startTimeLocal") or "")[:10] or today.isoformat(),
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
        d = (start + timedelta(days=i)).isoformat()
        try:
            stats = client.get_stats(d) or {}
        except Exception:
            stats = {}
        try:
            sleep = (client.get_sleep_data(d) or {}).get("dailySleepDTO", {}) or {}
        except Exception:
            sleep = {}
        try:
            hrv_data = client.get_hrv_data(d) or {}
            hrv_summary = hrv_data.get("hrvSummary") or {}
            hrv = hrv_summary.get("lastNightAvg")
            hrv_status = hrv_summary.get("status")
            hrv_weekly_avg = hrv_summary.get("weeklyAvg")
            hrv_baseline_low = (hrv_summary.get("baseline") or {}).get("balancedLow")
            hrv_baseline_high = (hrv_summary.get("baseline") or {}).get("balancedUpper")
        except Exception:
            hrv = hrv_status = hrv_weekly_avg = hrv_baseline_low = hrv_baseline_high = None
        try:
            tr_list = client.get_training_readiness(d) or []
            # Take the most recent reading (last timestamp after wakeup reset)
            tr = next(
                (t for t in tr_list if t.get("inputContext") == "AFTER_WAKEUP_RESET"),
                tr_list[0] if tr_list else {},
            )
            tr_score = tr.get("score")
            tr_level = tr.get("level")
            tr_feedback = tr.get("feedbackShort")
        except Exception:
            tr_score = tr_level = tr_feedback = None

        metrics.append(
            {
                "user_id": user_id,
                "date": d,
                "sleep_hours": round((sleep.get("sleepTimeSeconds") or 0) / 3600, 1),
                "sleep_score": (sleep.get("sleepScores") or {}).get("overall", {}).get("value")
                if isinstance(sleep.get("sleepScores"), dict)
                else None,
                "deep_sleep_hrs": round((sleep.get("deepSleepSeconds") or 0) / 3600, 1),
                "rem_sleep_hrs": round((sleep.get("remSleepSeconds") or 0) / 3600, 1),
                "hrv": hrv,
                "hrv_status": hrv_status,
                "hrv_weekly_avg": hrv_weekly_avg,
                "hrv_baseline_low": hrv_baseline_low,
                "hrv_baseline_high": hrv_baseline_high,
                "resting_hr": stats.get("restingHeartRate"),
                "stress_level": stats.get("averageStressLevel"),
                "body_battery": stats.get("bodyBatteryMostRecentValue"),
                "vo2_max": stats.get("vO2MaxValue"),  # backfilled below
                "steps": stats.get("totalSteps"),
                "active_mins": round((stats.get("activeSeconds") or 0) / 60) or None,
                "training_readiness_score": tr_score,
                "training_readiness_level": tr_level,
                "training_readiness_feedback": tr_feedback,
            }
        )

    # Garmin's daily stats endpoint never returns vO2MaxValue for many devices.
    # Backfill from the same-day activity that has it (e.g. running activities
    # compute VO2 max and store it on the activity record).
    act_vo2_by_date: dict[str, float] = {}
    for a in activities:
        v = a.get("vo2_max")
        if v and a.get("date"):
            act_vo2_by_date[a["date"]] = float(v)

    for m in metrics:
        if m["vo2_max"] is None and m["date"] in act_vo2_by_date:
            m["vo2_max"] = act_vo2_by_date[m["date"]]

    logger.info(
        "Garmin real sync: %d activities, %d metric days for user=%s",
        len(activities),
        len(metrics),
        user_id,
    )
    return {"activities": activities, "metrics": metrics, "source": "garmin"}


def fetch_profile_details(
    user_id: str, garmin_email: str | None, garmin_password: str | None
) -> dict[str, Any]:
    """Pull the user's personal data from Garmin (name, height, weight, DOB, sex).

    Prefer the browser-session cookie client when available; fall back to the
    password-based library path. Returns only the fields Garmin actually
    returned — callers should merge over the existing profile.
    """
    from . import garmin_browser, garmin_http

    if garmin_browser.has_valid_session(user_id):
        try:
            with garmin_http.GarminWebClient(user_id) as c:
                out = c.profile_fields()
            logger.info(
                "Garmin profile import (cookie) for user=%s → fields=%s",
                user_id,
                sorted(out.keys()),
            )
            return out
        except garmin_http.GarminAuthExpired:
            logger.info(
                "Garmin cookie session expired during profile import (user=%s)",
                user_id,
            )
        except Exception as e:
            logger.info("Garmin cookie profile import failed: %s", e)

    if not (garmin_email and garmin_password):
        return {}

    client = _login(user_id, garmin_email, garmin_password)
    out: dict[str, Any] = {}

    try:
        name = client.get_full_name()
        if name and isinstance(name, str):
            out["display_name"] = name.strip()
    except Exception as e:
        logger.info("Garmin: get_full_name failed: %s", e)

    # Core demographic / biometric data lives on the user-settings endpoint.
    try:
        settings = client.garth.connectapi(
            "/userprofile-service/userprofile/user-settings"
        ) or {}
        ud = settings.get("userData") or {}

        gender = (ud.get("gender") or "").strip().upper()
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

        w = ud.get("weight")  # grams
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
    except Exception as e:
        logger.info("Garmin: user-settings fetch failed: %s", e)

    # Prefer the most recent weigh-in if the user tracks weight regularly —
    # it's fresher than the static value on user-settings.
    try:
        today = date.today()
        start = (today - timedelta(days=60)).isoformat()
        bc = client.get_body_composition(start, today.isoformat()) or {}
        weighins = bc.get("dateWeightList") or []
        if weighins:
            latest = max(weighins, key=lambda x: x.get("date", ""))
            w = latest.get("weight")
            if w:
                out["weight_kg"] = round(float(w) / 1000.0, 1)
    except Exception as e:
        logger.info("Garmin: body composition fetch failed: %s", e)

    logger.info(
        "Garmin profile import for user=%s → fields=%s", user_id, sorted(out.keys())
    )
    return out


def sync_user(
    user_id: str, garmin_email: str | None, garmin_password: str | None
) -> dict[str, Any]:
    """Pull activities + metrics for a user.

    Priority:
      1. Browser-captured session (captcha-proof) → cookie-auth REST calls
      2. Password-based garminconnect library (legacy, fails on captcha'd accounts)
      3. No credentials → deterministic mock data so guest mode stays interactive
    """
    from . import garmin_browser, garmin_http

    if garmin_browser.has_valid_session(user_id):
        try:
            with garmin_http.GarminWebClient(user_id) as c:
                real = c.pull_all(user_id)
            return {
                "activities": real["activities"],
                "metrics": real["metrics"],
                "food_logs": [],
                "source": "garmin",
            }
        except garmin_http.GarminAuthExpired as e:
            raise GarminSyncError(
                "Garmin session has expired. Please re-connect Garmin "
                f"(browser login) from Settings. Detail: {e}"
            )
        except garmin_http.GarminApiError as e:
            raise GarminSyncError(f"Garmin API error: {e}")

    # Use garth token cache (set by direct_login) or fall back to password.
    if has_garth_session(user_id) or (garmin_email and garmin_password):
        real = _pull_real_data(user_id, garmin_email, garmin_password)
        return {
            "activities": real["activities"],
            "metrics": real["metrics"],
            "food_logs": [],
            "source": "garmin",
        }

    return {
        "activities": _mock_activities(user_id),
        "metrics": _mock_metrics(user_id),
        "food_logs": _mock_food_logs(user_id),
        "source": "mock",
    }
