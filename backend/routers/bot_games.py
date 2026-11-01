from datetime import datetime, timezone
from io import StringIO
from typing import Literal

import chess.pgn

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models.bot_game import BotGame


router = APIRouter(
    prefix="/api/bot-games",
    tags=["bot-games"],
)


class SaveBotGameBody(BaseModel):
    pgn: str = Field(min_length=1, max_length=200_000)
    player_color: Literal["w", "b"]
    bot_level: int = Field(ge=1, le=20)
    time_control: str = Field(default="unlimited", max_length=20)
    result: Literal["win", "loss", "draw"]
    termination: str = Field(default="unknown", max_length=40)
    moves_count: int = Field(default=0, ge=0)
    final_fen: str = Field(min_length=1, max_length=200)


class SaveBotGameAnalysisBody(BaseModel):
    analysis_data: dict


def serialize_game(game: BotGame, include_pgn: bool = False) -> dict:
    data = {
        "id": game.id,
        "player_color": game.player_color,
        "bot_level": game.bot_level,
        "time_control": game.time_control,
        "result": game.result,
        "termination": game.termination,
        "moves_count": game.moves_count,
        "final_fen": game.final_fen,
        "created_at": (
            game.created_at.isoformat()
            if game.created_at else None
        ),
        "analyzed_at": (
            game.analyzed_at.isoformat()
            if game.analyzed_at else None
        ),
        "has_analysis": game.analysis_data is not None,
    }

    if include_pgn:
        data["pgn"] = game.pgn
        data["analysis_data"] = game.analysis_data

    return data


@router.post("/")
def save_bot_game(
    body: SaveBotGameBody,
    db: Session = Depends(get_db),
):
    """Сохраняет законченную партию против бота."""

    parsed_game = chess.pgn.read_game(
        StringIO(body.pgn)
    )

    if parsed_game is None:
        raise HTTPException(
            status_code=400,
            detail="Не удалось прочитать PGN партии.",
        )

    if parsed_game.errors:
        raise HTTPException(
            status_code=400,
            detail="PGN содержит ошибки.",
        )

    record = BotGame(
        pgn=body.pgn,
        player_color=body.player_color,
        bot_level=body.bot_level,
        time_control=body.time_control,
        result=body.result,
        termination=body.termination,
        moves_count=body.moves_count,
        final_fen=body.final_fen,
    )

    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Не удалось сохранить партию в базе данных.",
        )

    return {
        "ok": True,
        "game": serialize_game(record),
    }


@router.get("/")
def get_bot_games(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Возвращает историю игр с ботом."""

    games = (
        db.query(BotGame)
        .order_by(BotGame.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    total = db.query(BotGame).count()

    return {
        "games": [
            serialize_game(game)
            for game in games
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{game_id}")
def get_bot_game(
    game_id: int,
    db: Session = Depends(get_db),
):
    """Возвращает полную запись партии и PGN."""

    game = db.get(BotGame, game_id)

    if game is None:
        raise HTTPException(
            status_code=404,
            detail="Партия не найдена.",
        )

    return {
        "game": serialize_game(
            game,
            include_pgn=True,
        )
    }


@router.put("/{game_id}/analysis")
def save_bot_game_analysis(
    game_id: int,
    body: SaveBotGameAnalysisBody,
    db: Session = Depends(get_db),
):
    """Сохраняет результаты анализа ранее сохранённой партии."""

    game = db.get(BotGame, game_id)

    if game is None:
        raise HTTPException(
            status_code=404,
            detail="Партия не найдена.",
        )

    game.analysis_data = body.analysis_data
    game.analyzed_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(game)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Не удалось сохранить анализ партии.",
        )

    return {
        "ok": True,
        "game": serialize_game(game),
    }


__all__ = ["router"]