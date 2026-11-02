from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.user_data import (
    UserActivity,
    UserCompleted,
    UserNote,
    UserStreakResult,
)
from services.auth import get_current_user
from services.training_plan import RECOMMENDATION_RULES, build_personal_plan


router = APIRouter()


class CompleteBody(BaseModel):
    day: int = Field(ge=1, le=1095)
    completed: bool


class NoteBody(BaseModel):
    day: int = Field(ge=1, le=1095)
    text: str = Field(default="", max_length=10_000)


class ActivityBody(BaseModel):
    day_date: str = Field(min_length=10, max_length=10)


class StreakBody(BaseModel):
    result: str = Field(pattern="^(win|loss|draw)$")


def _require_profile(user: User) -> None:
    if not (
        user.onboarding_completed
        and user.current_elo is not None
        and user.target_elo is not None
        and user.goal_days is not None
        and user.daily_minutes is not None
    ):
        raise HTTPException(
            status_code=409,
            detail="Сначала настрой цель по рейтингу и срок.",
        )


def _build_plan(db: Session, user: User) -> dict:
    _require_profile(user)
    completed = {
        row.day_num
        for row in db.query(UserCompleted.day_num)
        .filter(UserCompleted.user_id == user.id)
        .all()
    }
    notes = {
        row.day_num: row.text
        for row in db.query(UserNote.day_num, UserNote.text)
        .filter(UserNote.user_id == user.id)
        .all()
    }

    profile = build_personal_plan(
        current_elo=user.current_elo,
        target_elo=user.target_elo,
        goal_days=user.goal_days,
        daily_minutes=user.daily_minutes,
        completed_days=completed,
        notes=notes,
        start_on=user.goal_started_on,
    )
    return profile


@router.get("/api/plan")
def get_plan(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _build_plan(db, user)


@router.get("/api/recommendations")
def get_recommendations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    notes = [
        row[0].lower()
        for row in db.query(UserNote.text)
        .filter(
            UserNote.user_id == user.id,
            UserNote.text.isnot(None),
            UserNote.text != "",
        )
        .all()
        if row[0]
    ]

    found_themes = set()
    for note in notes:
        for keyword, theme in RECOMMENDATION_RULES.items():
            if keyword in note:
                found_themes.add(theme)

    return {"recommendations": sorted(found_themes)}


@router.post("/api/complete")
def complete_day(
    body: CompleteBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_profile(user)
    if body.day > user.goal_days:
        raise HTTPException(status_code=404, detail="Такого дня нет в твоём плане.")

    existing = db.get(UserCompleted, (user.id, body.day))
    if body.completed:
        if existing is None:
            db.add(UserCompleted(
                user_id=user.id,
                day_num=body.day,
                completed_at=date.today().isoformat(),
            ))
        else:
            existing.completed_at = date.today().isoformat()
    elif existing is not None:
        db.delete(existing)

    db.commit()
    return {"ok": True}


@router.post("/api/note")
def save_note(
    body: NoteBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_profile(user)
    if body.day > user.goal_days:
        raise HTTPException(status_code=404, detail="Такого дня нет в твоём плане.")

    existing = db.get(UserNote, (user.id, body.day))
    if existing is None:
        db.add(UserNote(user_id=user.id, day_num=body.day, text=body.text))
    else:
        existing.text = body.text
    db.commit()
    return {"ok": True}


@router.get("/api/diary")
def get_diary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    dates = [
        row[0]
        for row in db.query(UserActivity.day_date)
        .filter(UserActivity.user_id == user.id)
        .order_by(UserActivity.day_date.asc())
        .all()
    ]
    return {"activity": dates}


@router.post("/api/diary")
def mark_diary(
    body: ActivityBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        parsed = date.fromisoformat(body.day_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Дата должна быть в формате ГГГГ-ММ-ДД.")

    if parsed > date.today():
        raise HTTPException(status_code=422, detail="Нельзя отметить будущую дату.")

    key = (user.id, parsed.isoformat())
    if db.get(UserActivity, key) is None:
        db.add(UserActivity(user_id=user.id, day_date=parsed.isoformat()))
        db.commit()
    return {"ok": True}


@router.get("/api/streak")
def get_streak(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date.today().isoformat()
    results = [
        row[0]
        for row in db.query(UserStreakResult.result)
        .filter(UserStreakResult.user_id == user.id, UserStreakResult.date == today)
        .order_by(UserStreakResult.id.asc())
        .all()
    ]

    wins = results.count("win")
    losses = results.count("loss")
    draws = results.count("draw")
    current_streak = 0
    max_streak = 0

    for result in results:
        if result == "win":
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 0

    return {
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "current_streak": current_streak,
        "max_streak": max_streak,
    }


@router.post("/api/streak")
def add_streak_result(
    body: StreakBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.add(UserStreakResult(
        user_id=user.id,
        date=date.today().isoformat(),
        result=body.result,
    ))
    db.commit()
    return {"ok": True}
