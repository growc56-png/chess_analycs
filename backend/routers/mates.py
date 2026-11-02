"""API-маршруты для сохранения персональных рекордов задач на мат."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.user_data import UserMateRecord
from services.auth import get_current_user

router = APIRouter(tags=["mate-records"])


class MateRecordBody(BaseModel):
    mate_id: str = Field(min_length=1, max_length=80)
    time: float = Field(gt=0, le=86_400)


@router.get("/api/mates/records")
def get_mate_records(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.query(UserMateRecord).filter(UserMateRecord.user_id == user.id).all()
    records = {row.mate_id: row.best_time for row in rows}
    return {"records": records}


@router.post("/api/mates/records")
def save_mate_record(
    body: MateRecordBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = db.get(UserMateRecord, (user.id, body.mate_id))

    if record is None:
        db.add(UserMateRecord(
            user_id=user.id,
            mate_id=body.mate_id,
            best_time=body.time,
        ))
    elif record.best_time is None or body.time < record.best_time:
        record.best_time = body.time

    db.commit()
    return {"ok": True}


__all__ = ["router"]
