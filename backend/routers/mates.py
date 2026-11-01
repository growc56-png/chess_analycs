"""API-маршруты для сохранения рекордов задач на мат."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import MateRecord

router = APIRouter(tags=["mate-records"])


class MateRecordBody(BaseModel):
    mate_id: str
    time: float


@router.get("/api/mates/records")
def get_mate_records(db: Session = Depends(get_db)):
    """Возвращает лучшее время решения для каждой задачи на мат."""
    rows = db.query(MateRecord).all()
    records = {row.mate_id: row.best_time for row in rows}
    return {"records": records}


@router.post("/api/mates/records")
def save_mate_record(body: MateRecordBody, db: Session = Depends(get_db)):
    """Сохраняет рекорд, только если новое время лучше предыдущего."""
    record = db.get(MateRecord, body.mate_id)

    if record is None:
        db.add(MateRecord(mate_id=body.mate_id, best_time=body.time))
    elif record.best_time is None or body.time < record.best_time:
        record.best_time = body.time

    db.commit()
    return {"ok": True}


__all__ = ["router"]
