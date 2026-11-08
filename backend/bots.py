import random

import chess
import chess.engine
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import STOCKFISH_PATH
from services.stockfish import ENGINE_LOCK, configure_engine, safe_engine_quit

router = APIRouter()


class BotMoveRequest(BaseModel):
    fen: str
    level: int = Field(default=6, ge=1, le=20)
    mode: str = "unlimited"


@router.post("/api/bot_move")
def get_bot_move(req: BotMoveRequest):
    try:
        board = chess.Board(req.fen)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Неверный FEN")

    if board.is_game_over():
        return {"move": None}

    if not STOCKFISH_PATH.is_file():
        raise HTTPException(status_code=503, detail="Stockfish не найден. Проверь STOCKFISH_PATH.")

    engine = None
    # Все маршруты используют одну блокировку: бот не должен незаметно
    # запускать дополнительные тяжёлые процессы во время анализа партий.
    with ENGINE_LOCK:
        try:
            engine = chess.engine.SimpleEngine.popen_uci(str(STOCKFISH_PATH), timeout=10)
            configure_engine(engine, profile="bot")

            level_map = {
                1: (0, 1), 2: (3, 2), 3: (6, 3),
                4: (10, 5), 5: (15, 8), 6: (20, 12),
            }
            skill, depth = level_map.get(req.level, (20, 12))
            if "Skill Level" in getattr(engine, "options", {}):
                engine.configure({"Skill Level": skill})

            if req.mode == "bullet":
                infos = engine.analyse(board, chess.engine.Limit(time=0.1), multipv=3)
                if not infos:
                    return {"move": None}
                if random.random() < 0.5 and len(infos) > 1:
                    chosen = random.choice(infos[1:])
                else:
                    chosen = infos[0]
                return {"move": chosen["pv"][0].uci() if chosen.get("pv") else None}

            if req.mode in ("blitz", "rapid"):
                result = engine.play(board, chess.engine.Limit(time=0.5))
            else:
                result = engine.play(board, chess.engine.Limit(depth=depth, time=1.0))
            return {"move": result.move.uci() if result.move else None}

        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=503,
                detail="Stockfish временно недоступен. Проверь установку движка и попробуй ещё раз.",
            )
        finally:
            safe_engine_quit(engine)
