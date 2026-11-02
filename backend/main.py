"""Главная точка входа Chess Trainer."""

import os
import sys

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)


from config import JS_DIR, CSS_DIR, IMG_DIR  # noqa: E402

from bots import router as bots_router  # noqa: E402

from routers.analysis import (  # noqa: E402
    router as analysis_router,
    configure_analysis_router,
)

from routers.chesscom import router as chesscom_router  # noqa: E402
from routers.users import router as users_router  # noqa: E402
from routers.auth import router as auth_router  # noqa: E402
from routers.mates import router as mates_router  # noqa: E402
from routers.chess import router as chess_router  # noqa: E402

from routers.bot_games import router as bot_games_router  # noqa: E402

from routers.evaluation import (  # noqa: E402
    router as evaluation_router,
    configure_engine_router,
)

from routers.pages import router as pages_router  # noqa: E402

from services.chess_content import is_book_move  # noqa: E402


app = FastAPI(title="Chess Trainer")


# Статические ресурсы.
app.mount(
    "/js",
    StaticFiles(directory=str(JS_DIR)),
    name="js",
)

app.mount(
    "/css",
    StaticFiles(directory=str(CSS_DIR)),
    name="css",
)

app.mount(
    "/img",
    StaticFiles(directory=str(IMG_DIR)),
    name="img",
)


# Передача проверки дебютных ходов анализаторам.
configure_analysis_router(is_book_move)
configure_engine_router(is_book_move)


# API и страницы.
app.include_router(bots_router)
app.include_router(chesscom_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(chess_router)
app.include_router(mates_router)
app.include_router(bot_games_router)
app.include_router(analysis_router)
app.include_router(evaluation_router)
app.include_router(pages_router)


__all__ = ["app"]