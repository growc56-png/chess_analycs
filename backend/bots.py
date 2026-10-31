import chess
import chess.engine
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import random

router = APIRouter()

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(CURRENT_DIR)
STOCKFISH_PATH = os.path.join(BASE_DIR, "stockfish-windows-x86-64-universal.exe")

class BotMoveRequest(BaseModel):
    fen: str
    level: int
    mode: str = "unlimited"

@router.post("/api/bot_move")
def get_bot_move(req: BotMoveRequest):
    try:
        board = chess.Board(req.fen)
    except Exception:
        raise HTTPException(status_code=400, detail="Неверный FEN")

    if board.is_game_over():
        return {"move": None}
        
    if not os.path.exists(STOCKFISH_PATH):
        raise HTTPException(status_code=500, detail="Stockfish не найден")
    
    engine = None
    try:
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        
        level_map = {
            1: (0, 1), 2: (3, 2), 3: (6, 3),
            4: (10, 5), 5: (15, 8), 6: (20, 12)
        }
        skill, depth = level_map.get(req.level, (20, 12))
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
            
        elif req.mode in ["blitz", "rapid"]:
            result = engine.play(board, chess.engine.Limit(time=0.5))
            return {"move": result.move.uci() if result.move else None}
            
        else:
            result = engine.play(board, chess.engine.Limit(depth=depth, time=1.0))
            return {"move": result.move.uci() if result.move else None}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if engine:
            try: engine.quit()
            except: pass