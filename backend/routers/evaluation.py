"""API-маршруты Stockfish с надёжным MultiPV и корректной обработкой матов."""

from __future__ import annotations

import importlib
import os
from typing import Callable, Optional

import chess
import chess.engine
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import STOCKFISH_PATH, EVALUATE_DEPTH, EVALUATE_TIME
from services.game_analyzer import analyze_game as run_game_analysis
from services.stockfish import (
    ENGINE_LOCK,
    get_engine_limit,
    parse_score,
    safe_engine_quit,
    configure_engine,
)

try:
    import services.stockfish as stockfish_service
except Exception:  # pragma: no cover - fallback for alternate import style
    stockfish_service = None

try:
    import services.game_analyzer as game_analyzer_service
except Exception:  # pragma: no cover - fallback for alternate import style
    game_analyzer_service = None

router = APIRouter(tags=["stockfish-analysis"])
_book_move_checker: Optional[Callable] = None


class AnalyzeBody(BaseModel):
    pgn: str


class EvaluateBody(BaseModel):
    fen: str


class OpeningVariationsBody(BaseModel):
    fen: str
    limit: int = 15


def configure_engine_router(book_move_checker: Callable) -> None:
    """Передаёт анализатору проверку дебютных ходов."""
    global _book_move_checker
    _book_move_checker = book_move_checker


def _white_score(score_obj):
    if score_obj is None:
        return None
    try:
        return score_obj.pov(chess.WHITE)
    except Exception:
        return score_obj


def _score_sort_value(score_obj, pov: chess.Color) -> float:
    """Числовой ключ сортировки: положительное значение лучше для стороны."""
    if score_obj is None:
        return -1e9
    try:
        side_score = score_obj.pov(pov)
    except Exception:
        side_score = score_obj
    try:
        value = side_score.score(mate_score=100000)
        return float(value if value is not None else -1e9)
    except Exception:
        try:
            return float(side_score.score() or -1e9)
        except Exception:
            return -1e9


def _format_pv(board: chess.Board, pv) -> str:
    temp = board.copy(stack=False)
    san_moves = []
    for move in (pv or [])[:12]:
        if move not in temp.legal_moves:
            break
        try:
            san_moves.append(temp.san(move))
            temp.push(move)
        except (ValueError, AssertionError):
            break
    return " ".join(san_moves)


def _line_from_info(board: chess.Board, info: dict, rank: int):
    pv = info.get("pv") or []
    score_obj = info.get("score")
    if not pv or score_obj is None:
        return None
    first_move = pv[0]
    if first_move not in board.legal_moves:
        return None

    parsed = parse_score(_white_score(score_obj))
    return {
        "rank": rank,
        "san": board.san(first_move),
        "uci": first_move.uci(),
        "pv": _format_pv(board, pv),
        "eval": parsed.get("eval", 0),
        "is_mate": bool(parsed.get("is_mate", False)),
        "mate_in": int(parsed.get("mate_in", 0) or 0),
        "_sort": _score_sort_value(score_obj, board.turn),
    }


def get_multipv_lines_robust(engine, board: chess.Board, depth=None, multipv=3):
    """Возвращает уникальные легальные варианты, даже если MultiPV недоступен.

    Сначала используем штатный MultiPV. Если UCI-движок/обёртка вернули меньше
    нужного числа линий, повторяем запрос с явным списком root_moves, а в крайнем случае
    оцениваем легальные первые ходы по одному на коротком лимите.
    """
    if board.is_game_over(claim_draw=False):
        return []

    try:
        limit = get_engine_limit(depth=depth or EVALUATE_DEPTH)
    except TypeError:
        limit = get_engine_limit(depth=depth or EVALUATE_DEPTH, time_limit=EVALUATE_TIME)

    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return []

    requested_count = max(1, min(int(multipv or 3), 15, len(legal_moves)))
    candidates = {}

    def collect(infos):
        if isinstance(infos, dict):
            infos = [infos]
        for info in infos or []:
            line = _line_from_info(board, info, len(candidates) + 1)
            if not line:
                continue
            uci = line["uci"]
            previous = candidates.get(uci)
            if previous is None or line["_sort"] > previous["_sort"]:
                candidates[uci] = line

    # Pass 1: the normal UCI MultiPV request.
    try:
        collect(engine.analyse(board, limit, multipv=requested_count))
    except Exception:
        pass

    # Pass 2: explicitly constrain roots. Some Stockfish wrappers only return
    # one line unless root_moves is supplied, even if multipv=3 was requested.
    if len(candidates) < requested_count:
        try:
            collect(engine.analyse(
                board,
                limit,
                multipv=requested_count,
                root_moves=legal_moves,
            ))
        except Exception:
            pass

    # Pass 3: fallback for engines that reject MultiPV/root_moves together.
    # It is only used when necessary and analyses each legal first move briefly.
    if len(candidates) < requested_count:
        fallback_depth = max(8, min(int(depth or EVALUATE_DEPTH), 11))
        fallback_limit = chess.engine.Limit(
            depth=fallback_depth,
            time=max(0.045, min(0.10, float(EVALUATE_TIME or 1.0) / 14.0)),
        )
        for move in legal_moves[:requested_count]:
            if move.uci() in candidates:
                continue
            try:
                info = engine.analyse(board, fallback_limit, root_moves=[move])
                collect(info)
            except Exception:
                continue

    result = sorted(candidates.values(), key=lambda item: item["_sort"], reverse=True)[:requested_count]
    for rank, line in enumerate(result, start=1):
        line["rank"] = rank
        line.pop("_sort", None)
    return result


def _mate_winner_from_move(move_data):
    """Возвращает цвет, которому мат, из signed mate_in (White POV)."""
    try:
        value = int(move_data.get("mate_in", 0) or 0)
    except (TypeError, ValueError):
        value = 0
    if value > 0:
        return chess.WHITE
    if value < 0:
        return chess.BLACK
    return None


def repair_mate_classifications(result):
    """Не ставит зевок за собственный форсированный мат или вынужденный ответ.

    В ответе анализатора mate_in подписан с точки зрения белых. Сторона,
    сделавшая ход, определяется из FEN после хода, а не из цвета интерфейса.
    Если в позиции уже был форсированный мат против игрока, последующие
    продолжения этого уже неизбежного мата помечаются как вынужденные.
    """
    if not isinstance(result, dict) or not isinstance(result.get("moves"), list):
        return result

    previous_mating_side = None
    for move_data in result["moves"]:
        if not isinstance(move_data, dict):
            previous_mating_side = None
            continue

        fen = move_data.get("fen")
        try:
            board_after = chess.Board(fen) if fen else None
        except (ValueError, TypeError):
            board_after = None

        if board_after is None:
            previous_mating_side = None
            continue

        mover = not board_after.turn
        classification = str(move_data.get("classification", ""))
        is_mate = bool(move_data.get("is_mate"))
        mating_side = _mate_winner_from_move(move_data) if is_mate else None

        # Мат уже поставлен этим ходом: побеждает сторона, только что ходившая.
        if board_after.is_checkmate():
            move_data["classification"] = "brilliant" if classification == "brilliant" else "best"
            move_data["cp_loss"] = 0
            move_data["centipawn_loss"] = 0
            move_data["win_percent_loss"] = 0
            move_data["move_accuracy"] = 100.0
            previous_mating_side = mover
            continue

        if is_mate and mating_side is not None:
            if mating_side == mover:
                # После хода у самого ходившего есть форсированный мат.
                # Не наказываем winning move за material/centipawn heuristics.
                move_data["classification"] = "brilliant" if classification == "brilliant" else "best"
                move_data["cp_loss"] = 0
                move_data["centipawn_loss"] = 0
                move_data["win_percent_loss"] = 0
                move_data["move_accuracy"] = 100.0
            elif previous_mating_side == mating_side:
                # Соперник уже имел форсированный мат до этого ответа;
                # это продолжение проигранной позиции, а не новая зевнутая тактика.
                move_data["classification"] = "forced"
                move_data["cp_loss"] = 0
                move_data["centipawn_loss"] = 0
                move_data["win_percent_loss"] = 0
                move_data["move_accuracy"] = 100.0
            else:
                # Именно этот ход впервые допустил форсированный мат соперника.
                move_data["classification"] = "blunder"
            previous_mating_side = mating_side
        else:
            previous_mating_side = None

    return result


def _install_analysis_service_patches():
    """Подменяет MultiPV в общем namespace сервиса и постобработку API анализа."""
    if stockfish_service is not None:
        stockfish_service.get_multipv_lines = get_multipv_lines_robust

    if game_analyzer_service is not None:
        if hasattr(game_analyzer_service, "get_multipv_lines"):
            game_analyzer_service.get_multipv_lines = get_multipv_lines_robust
        analyzer = getattr(game_analyzer_service, "analyze_game", None)
        analyzer_globals = getattr(analyzer, "__globals__", {})
        if "get_multipv_lines" in analyzer_globals:
            analyzer_globals["get_multipv_lines"] = get_multipv_lines_robust

    # Основной /api/analyze зарегистрирован в routers.analysis. Его endpoint
    # обращается к imported function через globals, поэтому меняем только эту
    # ссылку, не пересоздавая APIRoute и не ломая FastAPI validation.
    try:
        analysis_routes_module = importlib.import_module("routers.analysis")
        analysis_router = getattr(analysis_routes_module, "router", None)
        for route in getattr(analysis_router, "routes", []):
            if getattr(route, "path", None) != "/api/analyze":
                continue
            endpoint_globals = getattr(getattr(route, "endpoint", None), "__globals__", {})
            for name, value in list(endpoint_globals.items()):
                if value is run_game_analysis and not getattr(value, "__mate_repair_wrapper__", False):
                    original = value

                    def wrapped_analysis(*args, __original=original, **kwargs):
                        return repair_mate_classifications(__original(*args, **kwargs))

                    wrapped_analysis.__mate_repair_wrapper__ = True
                    endpoint_globals[name] = wrapped_analysis
    except Exception:
        # The evaluation router remains functional even if a custom router
        # layout uses a different import path.
        pass


_install_analysis_service_patches()


@router.post("/api/analyze")
def analyze_game(body: AnalyzeBody):
    """Совместимый endpoint анализа партии с исправленной мат-классификацией."""
    result = run_game_analysis(
        body.pgn,
        book_move_checker=_book_move_checker,
    )
    return repair_mate_classifications(result)


@router.get("/api/engine/status")
def get_engine_status():
    """Проверяет доступность установленного движка и показывает его UCI-версию."""
    if not os.path.isfile(STOCKFISH_PATH):
        return {
            "available": False,
            "engine": None,
            "path": os.path.basename(str(STOCKFISH_PATH)),
            "error": "Stockfish не найден. Запусти scripts/install_stockfish.py или задай STOCKFISH_PATH.",
        }

    with ENGINE_LOCK:
        engine = None
        try:
            engine = chess.engine.SimpleEngine.popen_uci(str(STOCKFISH_PATH), timeout=10)
            settings = configure_engine(engine, profile="analysis")
            identity = getattr(engine, "id", {}) or {}
            return {
                "available": True,
                "engine": identity.get("name", "Stockfish"),
                "author": identity.get("author"),
                "path": os.path.basename(str(STOCKFISH_PATH)),
                "threads": settings["threads"],
                "hash_mb": settings["hash_mb"],
                "analysis_depth": EVALUATE_DEPTH,
                "analysis_time": EVALUATE_TIME,
            }
        except Exception:
            return {
                "available": False,
                "engine": None,
                "path": os.path.basename(str(STOCKFISH_PATH)),
                "error": "Не удалось запустить Stockfish. Проверь путь, права запуска и совместимость сборки.",
            }
        finally:
            safe_engine_quit(engine)


@router.post("/api/evaluate")
def evaluate_position(body: EvaluateBody):
    """Оценивает FEN и возвращает до трёх лучших продолжений Stockfish."""
    with ENGINE_LOCK:
        engine = None
        try:
            try:
                board = chess.Board(body.fen)
            except ValueError:
                raise HTTPException(status_code=400, detail="Некорректный FEN")

            if not board.is_valid():
                raise HTTPException(status_code=400, detail="Позиция некорректна")

            if not os.path.exists(STOCKFISH_PATH):
                raise HTTPException(status_code=500, detail="Stockfish не найден")

            engine = chess.engine.SimpleEngine.popen_uci(str(STOCKFISH_PATH))
            engine_config = configure_engine(engine, profile="analysis")

            # Сначала получаем основную оценку позиции. Даже если движок
            # не сможет построить MultiPV-линии, численная оценка останется доступна.
            score_info = engine.analyse(
                board,
                get_engine_limit(depth=EVALUATE_DEPTH, time_limit=EVALUATE_TIME),
            )
            score_obj = score_info.get("score") if isinstance(score_info, dict) else None
            score_dict = parse_score(_white_score(score_obj))

            try:
                top_moves = get_multipv_lines_robust(
                    engine,
                    board,
                    depth=EVALUATE_DEPTH,
                )
            except Exception:
                top_moves = []
            return {
                **score_dict,
                "top_moves": top_moves,
                "top_moves_count": len(top_moves),
            }

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Ошибка оценки позиции: {str(exc)}",
            )
        finally:
            safe_engine_quit(engine)



@router.post("/api/openings/variations")
def get_opening_variations(body: OpeningVariationsBody):
    """Возвращает до 15 лучших легальных ответвлений из Stockfish."""
    with ENGINE_LOCK:
        engine = None
        try:
            try:
                board = chess.Board(body.fen)
            except ValueError:
                raise HTTPException(status_code=400, detail="Некорректный FEN")
            if not board.is_valid():
                raise HTTPException(status_code=400, detail="Позиция некорректна")
            if board.is_game_over(claim_draw=False):
                return {"moves": []}
            if not os.path.isfile(STOCKFISH_PATH):
                raise HTTPException(status_code=500, detail="Stockfish не найден")
            engine = chess.engine.SimpleEngine.popen_uci(str(STOCKFISH_PATH))
            configure_engine(engine, profile="analysis")
            depth = max(8, min(int(EVALUATE_DEPTH or 12), 12))
            moves = get_multipv_lines_robust(
                engine, board, depth=depth, multipv=max(1, min(body.limit, 15))
            )
            return {"moves": moves}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Не удалось построить варианты: {exc}")
        finally:
            safe_engine_quit(engine)


__all__ = ["router", "configure_engine_router", "get_multipv_lines_robust", "repair_mate_classifications"]
