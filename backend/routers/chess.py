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
