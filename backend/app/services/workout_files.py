"""Parse workout files (FIT / TCX / GPX) into Activity dicts.

These come straight from a Garmin device or from Garmin Connect's
"Export to TCX/GPX/Original" buttons — no Garmin SSO required.

Public API:
    parse_workout_file(filename, raw_bytes, user_id) -> dict | None
        Returns a dict ready for the `activities` table, or None on failure.

Each parser is best-effort and tolerant of missing fields. We never raise on
truncated or partially-corrupt files; we just return whatever we could read.
"""
from __future__ import annotations

import hashlib
import io
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


# Garmin's typeKey vocabulary → our canonical types.
_TYPE_MAP: dict[str, str] = {
    "running": "running",
    "treadmill_running": "running",
    "trail_running": "running",
    "indoor_running": "running",
    "cycling": "cycling",
    "road_biking": "cycling",
    "mountain_biking": "cycling",
    "indoor_cycling": "cycling",
    "virtual_ride": "cycling",
    "gravel_cycling": "cycling",
    "walking": "walking",
    "casual_walking": "walking",
    "hiking": "hiking",
    "swimming": "swimming",
    "lap_swimming": "swimming",
    "open_water_swimming": "swimming",
    "strength_training": "strength_training",
    "cardio": "cardio",
    "yoga": "yoga",
    "rowing": "rowing",
    "indoor_rowing": "rowing",
    "elliptical": "cardio",
    "other": "other",
    1: "running",
    2: "cycling",
    5: "swimming",
    6: "swimming",
    11: "walking",
    13: "cardio",
    14: "cardio",
    17: "hiking",
    25: "strength_training",
}


def _normalize_type(raw: Any) -> str:
    if raw is None:
        return "other"
    if isinstance(raw, str):
        key = raw.lower().strip().replace(" ", "_")
        return _TYPE_MAP.get(key, key or "other")
    return _TYPE_MAP.get(raw, "other")


def _stable_id(seed: str) -> int:
    """Deterministic 60-bit positive int from a string. Used as a synthetic
    `garmin_id` so re-uploading the same file is idempotent (upsert)."""
    h = hashlib.sha1(seed.encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big") >> 4


def _ext(filename: str) -> str:
    return (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""


# ───────────────────────── FIT ─────────────────────────
def _parse_fit(raw: bytes, user_id: str, filename: str) -> dict[str, Any] | None:
    try:
        from fitparse import FitFile  # type: ignore
    except Exception as e:
        logger.error("fitparse not installed: %s", e)
        return None

    try:
        ff = FitFile(io.BytesIO(raw))
        ff.parse()
    except Exception as e:
        logger.warning("FIT parse failed (%s): %s", filename, e)
        return None

    session = next(iter(ff.get_messages("session")), None)
    if session is None:
        # Some files only have records — synthesise a session from records.
        records = list(ff.get_messages("record"))
        if not records:
            return None
        first = records[0].get_values()
        last = records[-1].get_values()
        ts0 = first.get("timestamp")
        ts1 = last.get("timestamp")
        duration_s = (ts1 - ts0).total_seconds() if ts0 and ts1 else 0
        hrs = [r.get_values().get("heart_rate") for r in records if r.get_values().get("heart_rate")]
        return _build_activity(
            user_id=user_id,
            filename=filename,
            sport="other",
            start_time=ts0,
            duration_s=duration_s,
            distance_m=last.get("distance") or 0,
            calories=0,
            avg_hr=int(sum(hrs) / len(hrs)) if hrs else None,
            max_hr=max(hrs) if hrs else None,
            elevation_gain_m=None,
            avg_speed_mps=None,
        )

    s = session.get_values()
    return _build_activity(
        user_id=user_id,
        filename=filename,
        sport=str(s.get("sport") or "other"),
        start_time=s.get("start_time"),
        duration_s=s.get("total_elapsed_time") or s.get("total_timer_time") or 0,
        distance_m=s.get("total_distance") or 0,
        calories=s.get("total_calories") or 0,
        avg_hr=s.get("avg_heart_rate"),
        max_hr=s.get("max_heart_rate"),
        elevation_gain_m=s.get("total_ascent"),
        avg_speed_mps=s.get("avg_speed") or s.get("enhanced_avg_speed"),
    )


# ───────────────────────── TCX ─────────────────────────
_TCX_NS = {
    "tcx": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2",
    "ns3": "http://www.garmin.com/xmlschemas/ActivityExtension/v2",
}


def _parse_tcx(raw: bytes, user_id: str, filename: str) -> dict[str, Any] | None:
    try:
        root = ET.fromstring(raw)
    except Exception as e:
        logger.warning("TCX parse failed (%s): %s", filename, e)
        return None

    activity = root.find(".//tcx:Activities/tcx:Activity", _TCX_NS)
    if activity is None:
        return None

    sport = activity.get("Sport") or "Other"
    laps = activity.findall("tcx:Lap", _TCX_NS)
    if not laps:
        return None

    duration_s = 0.0
    distance_m = 0.0
    calories = 0
    hr_total = 0
    hr_count = 0
    max_hr = 0
    for lap in laps:
        try:
            duration_s += float(lap.findtext("tcx:TotalTimeSeconds", "0", _TCX_NS) or 0)
            distance_m += float(lap.findtext("tcx:DistanceMeters", "0", _TCX_NS) or 0)
            calories += int(float(lap.findtext("tcx:Calories", "0", _TCX_NS) or 0))
            avg_hr_el = lap.find("tcx:AverageHeartRateBpm/tcx:Value", _TCX_NS)
            if avg_hr_el is not None and avg_hr_el.text:
                hr_total += int(avg_hr_el.text)
                hr_count += 1
            max_hr_el = lap.find("tcx:MaximumHeartRateBpm/tcx:Value", _TCX_NS)
            if max_hr_el is not None and max_hr_el.text:
                max_hr = max(max_hr, int(max_hr_el.text))
        except Exception:
            continue

    start_time_str = laps[0].get("StartTime")
    start_time = _parse_iso(start_time_str) if start_time_str else None

    return _build_activity(
        user_id=user_id,
        filename=filename,
        sport=sport,
        start_time=start_time,
        duration_s=duration_s,
        distance_m=distance_m,
        calories=calories,
        avg_hr=int(hr_total / hr_count) if hr_count else None,
        max_hr=max_hr or None,
        elevation_gain_m=None,
        avg_speed_mps=None,
    )


# ───────────────────────── GPX ─────────────────────────
def _parse_gpx(raw: bytes, user_id: str, filename: str) -> dict[str, Any] | None:
    try:
        import gpxpy  # type: ignore
    except Exception as e:
        logger.error("gpxpy not installed: %s", e)
        return None

    try:
        gpx = gpxpy.parse(io.BytesIO(raw))
    except Exception as e:
        logger.warning("GPX parse failed (%s): %s", filename, e)
        return None

    if not gpx.tracks:
        return None

    track = gpx.tracks[0]
    sport = (track.type or "other").lower()
    start_time = None
    end_time = None
    distance_m = 0.0
    elevation_gain = 0.0
    points = 0
    for seg in track.segments:
        distance_m += seg.length_3d() or 0
        ud = seg.get_uphill_downhill()
        elevation_gain += ud.uphill or 0
        for pt in seg.points:
            points += 1
            if pt.time:
                if not start_time or pt.time < start_time:
                    start_time = pt.time
                if not end_time or pt.time > end_time:
                    end_time = pt.time

    duration_s = (end_time - start_time).total_seconds() if start_time and end_time else 0

    return _build_activity(
        user_id=user_id,
        filename=filename,
        sport=sport,
        start_time=start_time,
        duration_s=duration_s,
        distance_m=distance_m,
        calories=0,
        avg_hr=None,
        max_hr=None,
        elevation_gain_m=elevation_gain or None,
        avg_speed_mps=None,
    )


# ───────────────────────── shared ─────────────────────────
def _parse_iso(s: str) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _build_activity(
    *,
    user_id: str,
    filename: str,
    sport: Any,
    start_time: datetime | None,
    duration_s: float,
    distance_m: float,
    calories: int | float,
    avg_hr: int | None,
    max_hr: int | None,
    elevation_gain_m: float | None,
    avg_speed_mps: float | None,
) -> dict[str, Any]:
    if start_time is None:
        start_time = datetime.now(timezone.utc)
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)

    distance_km = round((distance_m or 0) / 1000.0, 2)
    duration_min = round((duration_s or 0) / 60.0, 1)

    pace_min_km = None
    if avg_speed_mps and avg_speed_mps > 0:
        pace_min_km = round((1000.0 / avg_speed_mps) / 60.0, 2)
    elif distance_km > 0 and duration_min > 0:
        pace_min_km = round(duration_min / distance_km, 2)

    seed = f"{user_id}|{filename}|{start_time.isoformat()}|{round(distance_m)}|{round(duration_s)}"

    return {
        "garmin_id": _stable_id(seed),
        "user_id": user_id,
        "date": start_time.date().isoformat(),
        "started_at": start_time.isoformat(),
        "type": _normalize_type(sport),
        "name": filename.rsplit(".", 1)[0] if filename else "Imported activity",
        "distance_km": distance_km,
        "duration_mins": duration_min,
        "calories_burned": int(calories or 0),
        "avg_hr": int(avg_hr) if avg_hr else None,
        "max_hr": int(max_hr) if max_hr else None,
        "avg_pace_min_km": pace_min_km,
        "elevation_m": round(elevation_gain_m, 0) if elevation_gain_m else None,
        "vo2_max": None,
        "training_effect": None,
        "gpx_data": None,
        "raw_data": None,
    }


def parse_workout_file(
    filename: str, raw: bytes, user_id: str
) -> dict[str, Any] | None:
    """Detect format from extension or magic bytes, parse, return Activity dict."""
    ext = _ext(filename)

    # FIT files start with header byte 0x0E or 0x0C.
    if ext == "fit" or (raw[:1] in (b"\x0e", b"\x0c")):
        return _parse_fit(raw, user_id, filename)

    # XML-based formats.
    head = raw[:512].lstrip()
    if ext == "tcx" or b"<TrainingCenterDatabase" in head:
        return _parse_tcx(raw, user_id, filename)
    if ext == "gpx" or b"<gpx" in head:
        return _parse_gpx(raw, user_id, filename)

    # Last-ditch attempts.
    if head.startswith(b"<?xml") or head.startswith(b"<"):
        if b"TrainingCenter" in head:
            return _parse_tcx(raw, user_id, filename)
        if b"gpx" in head:
            return _parse_gpx(raw, user_id, filename)

    logger.warning("Unrecognised workout file: %s (head=%r)", filename, head[:64])
    return None
