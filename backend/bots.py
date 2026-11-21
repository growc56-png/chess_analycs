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
    style: str = Field(default="balanced", pattern="^(adaptive|balanced|tactical|attacking|defensive)$")
    training_rating: int = Field(default=1000, ge=400, le=3000)


def rating_to_skill(rating: int) -> int:
    """Approximate training rating -> Stockfish Skill Level 0..20."""
    return max(0, min(20, round((rating - 400) / 95)))


def fixed_level_to_skill(level: int) -> int:
    # The 10 UI levels are evenly distributed across Stockfish's 0..20 range.
    return max(0, min(20, round((level - 1) * 20 / 9)))


def _choose_style_move(engine, board, skill, style, limit):
    infos = engine.analyse(board, limit, multipv=4)
    if not infos:
        return None
    scored = []
    for info in infos:
        pv = info.get("pv") or []
        if not pv:
            continue
        move = pv[0]
        score = info.get("score")
        cp = score.pov(board.turn).score(mate_score=100000) if score else 0
        scored.append((move, cp, info))
    if not scored:
        return None

    best_cp = max(item[1] for item in scored)
    tolerance = max(70, 360 - skill * 14)
    candidates = [item for item in scored if best_cp - item[1] <= tolerance]
    if not candidates:
        candidates = [scored[0]]

    def weight(item):
        move, cp, _ = item
        loss = max(0, best_cp - cp)
        tactical = (board.is_capture(move) * 2.0) + (board.gives_check(move) * 2.4)
        if style == "tactical":
            return max(0.15, 1.0 + tactical * 2.2 - loss / 180)
        if style == "attacking":
            return max(0.15, 1.0 + board.gives_check(move) * 3.0 + board.is_capture(move) * 1.1 - loss / 220)
        if style == "defensive":
            return max(0.15, 1.0 + (0.8 if not board.is_capture(move) else 0.0) - loss / 240)
        return max(0.15, 1.0 - loss / max(90, tolerance))

    selected = random.choices(candidates, weights=[weight(item) for item in candidates], k=1)[0]
    return selected[0]


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
    with ENGINE_LOCK:
        try:
            engine = chess.engine.SimpleEngine.popen_uci(str(STOCKFISH_PATH), timeout=10)
            configure_engine(engine, profile="bot")

            if req.style == "adaptive":
                skill = rating_to_skill(req.training_rating)
                opponent_rating = req.training_rating
            else:
                skill = fixed_level_to_skill(req.level)
                opponent_rating = 500 + req.level * 160

            if "Skill Level" in getattr(engine, "options", {}):
                engine.configure({"Skill Level": skill})

            if req.mode == "bullet":
                limit = chess.engine.Limit(time=0.12)
            elif req.mode in ("blitz", "rapid"):
                limit = chess.engine.Limit(time=0.45 if req.mode == "blitz" else 0.65)
            else:
                depth = max(2, min(22, 3 + skill))
                limit = chess.engine.Limit(depth=depth, time=0.8 if skill < 10 else 1.2)

            if req.style in ("tactical", "attacking", "defensive"):
                move = _choose_style_move(engine, board, skill, req.style, limit)
            else:
                result = engine.play(board, limit)
                move = result.move if result else None

            return {"move": move.uci() if move else None, "skill": skill, "opponent_rating": opponent_rating}

        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=503,
                detail="Stockfish временно недоступен. Проверь установку движка и попробуй ещё раз.",
            )
        finally:
            safe_engine_quit(engine)
