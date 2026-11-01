
import io
import threading
import time
import uuid

import chess.pgn

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.game_analyzer import analyze_game


router = APIRouter()

# Хранилище запущенных задач анализа
analysis_jobs = {}
analysis_jobs_lock = threading.Lock()

# Проверка дебютных ходов передаётся из main.py
_book_move_checker = None


class AnalyzeStartBody(BaseModel):
    pgn: str


def configure_analysis_router(book_move_checker):
    global _book_move_checker
    _book_move_checker = book_move_checker


def update_job_progress(job_id, processed, total, started_at):
    elapsed = time.time() - started_at
    eta = None

    if processed > 0 and total > processed:
        eta = int(
            (elapsed / processed) * (total - processed)
        )

    with analysis_jobs_lock:
        job = analysis_jobs.get(job_id)

        if job is None:
            return

        job["processed"] = processed
        job["total"] = total
        job["elapsed_seconds"] = round(elapsed)
        job["eta_seconds"] = eta


def run_analysis_job(job_id, pgn, total):
    started_at = time.time()

    with analysis_jobs_lock:
        analysis_jobs[job_id].update({
            "status": "running",
            "started_at": started_at,
            "processed": 0,
            "total": total,
            "eta_seconds": None
        })

    try:
        def progress_callback(processed, total_moves):
            update_job_progress(
                job_id,
                processed,
                total_moves,
                started_at
            )

        result = analyze_game(
            pgn,
            progress_callback=progress_callback,
            book_move_checker=_book_move_checker
        )

        elapsed = round(time.time() - started_at)

        with analysis_jobs_lock:
            job = analysis_jobs.get(job_id)

            if job is not None:
                job.update({
                    "status": "completed",
                    "processed": len(result["moves"]),
                    "total": total,
                    "elapsed_seconds": elapsed,
                    "eta_seconds": 0,
                    "result": result,
                    "error": None
                })

    except HTTPException as e:
        with analysis_jobs_lock:
            job = analysis_jobs.get(job_id)

            if job is not None:
                job.update({
                    "status": "failed",
                    "error": str(e.detail)
                })

    except Exception as e:
        with analysis_jobs_lock:
            job = analysis_jobs.get(job_id)

            if job is not None:
                job.update({
                    "status": "failed",
                    "error": str(e)
                })


@router.post("/api/analyze/start")
def start_analysis(body: AnalyzeStartBody):

    if not body.pgn or not body.pgn.strip():
        raise HTTPException(
            status_code=400,
            detail="PGN пустой"
        )

    # Проверяем PGN до создания фоновой задачи
    try:
        game = chess.pgn.read_game(io.StringIO(body.pgn))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Ошибка чтения PGN: {e}"
        )

    if game is None:
        raise HTTPException(
            status_code=400,
            detail="Не удалось прочитать PGN"
        )

    if game.errors:
        raise HTTPException(
            status_code=400,
            detail="Ошибка в PGN: " + str(game.errors[0])
        )

    total = len(list(game.mainline_moves()))
    job_id = uuid.uuid4().hex

    # Удаляем завершённые задачи старше одного часа
    now = time.time()

    with analysis_jobs_lock:
        expired = [
            key for key, job in analysis_jobs.items()
            if job["status"] in ("completed", "failed")
            and now - job.get("created_at", now) > 3600
        ]

        for key in expired:
            del analysis_jobs[key]

        analysis_jobs[job_id] = {
            "status": "queued",
            "processed": 0,
            "total": total,
            "created_at": now,
            "started_at": None,
            "elapsed_seconds": 0,
            "eta_seconds": None,
            "result": None,
            "error": None
        }

    thread = threading.Thread(
        target=run_analysis_job,
        args=(job_id, body.pgn, total),
        daemon=True
    )

    thread.start()

    return {
        "job_id": job_id,
        "status": "queued",
        "total": total
    }


@router.get("/api/analyze/status/{job_id}")
def get_analysis_status(job_id: str):

    with analysis_jobs_lock:
        job = analysis_jobs.get(job_id)

        if job is None:
            raise HTTPException(
                status_code=404,
                detail="Задача анализа не найдена"
            )

        snapshot = dict(job)

    total = snapshot["total"]
    processed = snapshot["processed"]

    if snapshot["status"] == "completed":
        percent = 100
    elif total > 0:
        percent = round(
            min(100, processed / total * 100),
            1
        )
    else:
        percent = 0

    elapsed = snapshot.get("elapsed_seconds", 0)

    if snapshot["status"] == "running":
        started_at = snapshot.get("started_at")

        if started_at:
            elapsed = round(time.time() - started_at)

    return {
        "status": snapshot["status"],
        "processed": processed,
        "total": total,
        "percent": percent,
        "elapsed_seconds": elapsed,
        "eta_seconds": snapshot["eta_seconds"],
        "result": snapshot["result"],
        "error": snapshot["error"]
    }
