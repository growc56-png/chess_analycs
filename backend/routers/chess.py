"""API-маршруты для задач, эндшпилей и дебютного репертуара."""

from fastapi import APIRouter, HTTPException

from services.chess_content import ENDGAMES, OPENINGS, PUZZLES

router = APIRouter(tags=["chess-content"])


@router.get("/api/puzzles")
def get_puzzles():
    """Возвращает список тактических задач."""
    return {"puzzles": PUZZLES}


@router.get("/api/endgames")
def get_endgames():
    """Возвращает список учебных эндшпилей."""
    return {"endgames": ENDGAMES}


@router.get("/api/openings/catalog")
def get_openings_catalog():
    """Быстрый каталог дебютов без длинных массивов ходов."""
    catalog = []
    for opening in OPENINGS:
        moves = opening.get("moves") or []
        catalog.append({
            "id": opening.get("id"),
            "side": opening.get("side"),
            "family": opening.get("family"),
            "name": opening.get("name"),
            "move_count": len(moves),
        })
    return {"openings": catalog}


@router.get("/api/openings/{opening_id}")
def get_opening_detail(opening_id: str):
    """Возвращает полную линию только для выбранного дебюта."""
    opening = next(
        (item for item in OPENINGS if str(item.get("id")) == opening_id),
        None,
    )
    if opening is None:
        raise HTTPException(status_code=404, detail="Дебют не найден")
    return {"opening": opening}


@router.get("/api/openings")
def get_openings():
    """Старый полный API оставлен для совместимости с главной страницей."""
    return {"openings": OPENINGS}


__all__ = ["router"]


@router.get("/api/puzzles/next")
def get_next_lichess_puzzle(theme: str = ""):
    """Получает одну задачу Lichess через сервер, чтобы не зависеть от браузерного CORS."""
    import json
    from urllib.error import HTTPError, URLError
    from urllib.request import Request, urlopen

    allowed_themes = {
        "fork", "pin", "mateIn1", "mateIn2", "mateIn3",
        "sacrifice", "doubleAttack", "discoveredAttack",
    }
    if theme and theme not in allowed_themes:
        raise HTTPException(status_code=400, detail="Неизвестная тема задачи")
    url = "https://lichess.org/api/puzzle/next"
    if theme:
        url += "?angle=" + theme
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "ChessTrainer/1.0"})
    try:
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code == 429:
            raise HTTPException(status_code=429, detail="Lichess ограничил запросы. Попробуй через минуту.")
        raise HTTPException(status_code=502, detail="Lichess временно не отдаёт задачи.")
    except (URLError, TimeoutError, ValueError):
        raise HTTPException(status_code=502, detail="Не удалось подключиться к Lichess. Проверь сервер.")
    if not isinstance(payload, dict) or not payload.get("puzzle") or not payload.get("game"):
        raise HTTPException(status_code=502, detail="Lichess вернул пустую задачу.")
    return payload
