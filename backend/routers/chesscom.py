import re

from fastapi import APIRouter, HTTPException

from services.chesscom import fetch_chesscom_games


router = APIRouter()


@router.get("/api/chesscom/{username}/games")
@router.get("/api/chesscom/games/{username}")
def chesscom_games(username: str, limit: int = 60):
    """
    Получает последние партии пользователя Chess.com.
    Поддерживает оба старых URL.
    """

    username = username.strip()

    if not re.fullmatch(r"[A-Za-z0-9_-]{2,25}", username):
        raise HTTPException(
            status_code=400,
            detail="Некорректный ник Chess.com"
        )

    limit = max(1, min(int(limit), 100))

    return fetch_chesscom_games(
        username,
        limit
    )