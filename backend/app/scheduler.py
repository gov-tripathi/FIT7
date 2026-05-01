"""Hourly Garmin sync scheduler (APScheduler).

Opt-in via ENABLE_SCHEDULER=true. Uses the service-role Supabase client so
it can iterate all users and bypass RLS.
"""
from __future__ import annotations

import logging
import time

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .services import garmin
from .supabase_client import service_client

logger = logging.getLogger(__name__)


def _sync_all_users() -> None:
    client = service_client()
    if not client:
        logger.warning("Scheduler: no service client — skipping")
        return

    users = (
        client.table("profiles")
        .select("id,garmin_email,garmin_token,garmin_enabled")
        .eq("garmin_enabled", True)
        .execute()
        .data or []
    )

    for u in users:
        user_id = u["id"]
        t0 = time.perf_counter()
        try:
            payload = garmin.sync_user(user_id, u.get("garmin_email"), u.get("garmin_token"))
            if payload["activities"]:
                client.table("activities").upsert(
                    payload["activities"], on_conflict="garmin_id"
                ).execute()
            if payload["metrics"]:
                client.table("health_metrics").upsert(
                    payload["metrics"], on_conflict="user_id,date"
                ).execute()
            client.table("sync_logs").insert(
                {
                    "user_id": user_id,
                    "status": "success",
                    "activities_new": len(payload["activities"]),
                    "metrics_new": len(payload["metrics"]),
                    "duration_ms": int((time.perf_counter() - t0) * 1000),
                }
            ).execute()
        except Exception as e:
            logger.exception("Sync failed for %s", user_id)
            client.table("sync_logs").insert(
                {
                    "user_id": user_id,
                    "status": "failed",
                    "error_message": str(e),
                    "duration_ms": int((time.perf_counter() - t0) * 1000),
                }
            ).execute()


def start(scheduler: AsyncIOScheduler) -> None:
    scheduler.add_job(_sync_all_users, "interval", hours=1, id="garmin_hourly_sync")
    scheduler.start()
    logger.info("Scheduler started: hourly Garmin sync")
