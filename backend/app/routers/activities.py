from fastapi import APIRouter, Depends, Query

from ..deps import CurrentUser, get_current_user, get_db

router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("")
def list_activities(
    limit: int = Query(30, le=200),
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("activities")
        .select("*")
        .eq("user_id", user.id)
        .order("date", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data


@router.get("/weekly-summary")
def weekly_summary(user: CurrentUser = Depends(get_current_user), db=Depends(get_db)):
    res = (
        db.table("weekly_activity_summary")
        .select("*")
        .eq("user_id", user.id)
        .order("week_start", desc=True)
        .limit(8)
        .execute()
    )
    return res.data
