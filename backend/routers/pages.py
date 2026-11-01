"""HTML-страницы и совместимые маршруты статических файлов фронтенда."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse

from config import HTML_DIR, CSS_DIR, JS_DIR

router = APIRouter(tags=["pages"])


def _static_file(base_dir: Path, filename: str, media_type: str) -> FileResponse:
    path = Path(base_dir) / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"{filename} не найден")
    return FileResponse(path, media_type=media_type)


def _html_page(filename: str) -> FileResponse:
    return _static_file(HTML_DIR, filename, "text/html; charset=utf-8")


# Старые URL оставлены как алиасы, чтобы не ломать прежние HTML-страницы.
@router.get("/index.css")
def get_index_css():
    return _static_file(CSS_DIR, "index.css", "text/css")


@router.get("/index.js")
def get_index_js():
    return _static_file(JS_DIR, "index.js", "application/javascript")


@router.get("/shared.js")
def get_shared_js():
    return _static_file(JS_DIR, "shared.js", "application/javascript")


@router.get("/bots.js")
def get_bots_js():
    return _static_file(JS_DIR, "bots.js", "application/javascript")


@router.get("/mates.js")
def get_mates_js():
    return _static_file(JS_DIR, "mates.js", "application/javascript")


@router.get("/", response_class=HTMLResponse)
def index():
    return _html_page("index.html")


@router.get("/bots", response_class=HTMLResponse)
def bots_page():
    return _html_page("bots.html")


@router.get("/mates", response_class=HTMLResponse)
def mates_page():
    return _html_page("mates.html")


@router.get("/openings", response_class=HTMLResponse)
def openings_page():
    """Отдельная страница для изучения дебютов и тренировки против бота."""
    return _html_page("openings.html")


__all__ = ["router"]
