from __future__ import annotations

from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import activities, ai, food, health, nutrition, orders, planner, profile, strava, sync
from .scheduler import start as start_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    scheduler: AsyncIOScheduler | None = None
    if settings.ENABLE_SCHEDULER:
        scheduler = AsyncIOScheduler()
        start_scheduler(scheduler)
    try:
        yield
    finally:
        if scheduler:
            scheduler.shutdown(wait=False)


app = FastAPI(title="FitFuel API", version="1.0.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthcheck():
    return {"status": "ok"}


app.include_router(profile.router)
app.include_router(activities.router)
app.include_router(health.router)
app.include_router(sync.router)
app.include_router(food.router)
app.include_router(nutrition.router)
app.include_router(ai.router)
app.include_router(planner.router)
app.include_router(orders.router)
app.include_router(strava.router)
