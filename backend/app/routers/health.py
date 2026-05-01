from fastapi import APIRouter, Depends, Query

from ..deps import CurrentUser, get_current_user, get_db

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/metrics")
def get_metrics(
    days: int = Query(30, le=90),
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("health_metrics")
        .select("*")
        .eq("user_id", user.id)
        .order("date", desc=True)
        .limit(days)
        .execute()
    )
    return res.data
