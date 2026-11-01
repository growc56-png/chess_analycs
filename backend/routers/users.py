
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Completed, Note, Activity, StreakResult

from services.training_plan import PLAN, RECOMMENDATION_RULES


router = APIRouter()


# ============================================================
# МОДЕЛИ ЗАПРОСОВ
# ============================================================

class CompleteBody(BaseModel):
    day: int
    completed: bool


class NoteBody(BaseModel):
    day: int
    text: str


class ActivityBody(BaseModel):
    day_date: str


class StreakBody(BaseModel):
    result: str


# ============================================================
# УЧЕБНЫЙ ПЛАН
# ============================================================

@router.get("/api/plan")
def get_plan(db: Session = Depends(get_db)):
    done = {
        row.day_num
        for row in db.query(Completed.day_num).all()
    }

    notes = {
        row.day_num: row.text
        for row in db.query(Note).all()
    }

    result = []

    for day in PLAN:
        item = dict(day)
        item["completed"] = day["day"] in done
        item["note"] = notes.get(day["day"], "")
        result.append(item)

    return {
        "plan": result,
        "total_days": len(PLAN),
        "completed_days": len(done)
    }


# ============================================================
# РЕКОМЕНДАЦИИ
# ============================================================

@router.get("/api/recommendations")
def get_recommendations(db: Session = Depends(get_db)):
    notes = [
        row.text.lower()
        for row in db.query(Note.text)
        .filter(Note.text.isnot(None), Note.text != "")
        .all()
        if row.text
    ]

    found_themes = set()

    for note in notes:
        for keyword, theme in RECOMMENDATION_RULES.items():
            if keyword in note:
                found_themes.add(theme)

    return {
        "recommendations": list(found_themes)
    }


# ============================================================
# ОТМЕТКИ ВЫПОЛНЕНИЯ
# ============================================================

@router.post("/api/complete")
def complete_day(
    body: CompleteBody,
    db: Session = Depends(get_db)
):
    if body.completed:
        db.merge(
            Completed(
                day_num=body.day,
                completed_at=date.today().isoformat()
            )
        )
    else:
        db.query(Completed).filter(
            Completed.day_num == body.day
        ).delete(synchronize_session=False)

    db.commit()

    return {"ok": True}


# ============================================================
# ЗАМЕТКИ
# ============================================================

@router.post("/api/note")
def save_note(
    body: NoteBody,
    db: Session = Depends(get_db)
):
    db.merge(
        Note(
            day_num=body.day,
            text=body.text
        )
    )

    db.commit()

    return {"ok": True}


# ============================================================
# ДНЕВНИК
# ============================================================

@router.get("/api/diary")
def get_diary(db: Session = Depends(get_db)):
    dates = [
        row.day_date
        for row in db.query(Activity.day_date)
        .order_by(Activity.day_date.asc())
        .all()
    ]

    return {"activity": dates}


@router.post("/api/diary")
def mark_diary(
    body: ActivityBody,
    db: Session = Depends(get_db)
):
    db.merge(
        Activity(day_date=body.day_date)
    )

    db.commit()

    return {"ok": True}


# ============================================================
# СТАТИСТИКА ЗА ДЕНЬ
# ============================================================

@router.get("/api/streak")
def get_streak(db: Session = Depends(get_db)):
    today = date.today().isoformat()

    results = [
        row.result
        for row in db.query(StreakResult.result)
        .filter(StreakResult.date == today)
        .order_by(StreakResult.id.asc())
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

            if current_streak > max_streak:
                max_streak = current_streak
        else:
            current_streak = 0

    return {
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "current_streak": current_streak,
        "max_streak": max_streak
    }


@router.post("/api/streak")
def add_streak_result(
    body: StreakBody,
    db: Session = Depends(get_db)
):
    today = date.today().isoformat()

    db.add(
        StreakResult(
            date=today,
            result=body.result
        )
    )

    db.commit()

    return {"ok": True}
