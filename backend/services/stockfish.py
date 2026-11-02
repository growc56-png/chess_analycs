import math
import threading

import chess
import chess.engine

from config import (
    STOCKFISH_PATH,
    ANALYSIS_DEPTH,
    ANALYSIS_TIME,
    EVALUATE_DEPTH,
    EVALUATE_TIME,
)

# Общая блокировка движка для анализа партий и отдельных позиций.
ENGINE_LOCK = threading.Lock()

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
}

MATE_SCORE = 10000


def get_engine_limit(depth=None, time_limit=None):
    return chess.engine.Limit(
        depth=depth or ANALYSIS_DEPTH,
        time=time_limit or ANALYSIS_TIME
    )


def parse_score(score_obj):
    if score_obj is None:
        return {
            "eval": 0,
            "is_mate": False,
            "mate_in": 0
        }

    if score_obj.is_mate():
        mate_in = score_obj.mate()

        return {
            "eval": 100 if mate_in is None or mate_in > 0 else -100,
            "is_mate": True,
            "mate_in": mate_in or 0
        }

    cp = score_obj.score()

    if cp is None:
        cp = 0

    return {
        "eval": round(cp / 100.0, 2),
        "is_mate": False,
        "mate_in": 0
    }


def score_to_cp(score_obj, color):
    if score_obj is None:
        return 0

    score = score_obj.pov(color)

    if score.is_mate():
        mate = score.mate()

        if mate is None:
            return 0

        if mate > 0:
            return MATE_SCORE - min(mate, 100)

        return -MATE_SCORE + min(abs(mate), 100)

    return score.score() or 0


def calc_expected_points(eval_cp):
    eval_cp = max(-1000, min(1000, eval_cp))
    return 1 / (1 + math.exp(-0.004 * eval_cp))


def expected_points_from_score(score_obj, color):
    cp = score_to_cp(score_obj, color)
    return calc_expected_points(cp)


def accuracy_from_centipawn_loss(cp_loss):
    """Return a stricter, transparent accuracy estimate from centipawn loss.

    This is an approximation, not Chess.com's proprietary CAPS2 calculation.
    Version 3 uses a steeper decay because the previous curve overstated
    accuracy for games containing several small and medium inaccuracies.
    """
    try:
        loss = max(0.0, float(cp_loss or 0.0))
    except (TypeError, ValueError):
        loss = 0.0
    return round(max(0.0, min(100.0, 100.0 * math.exp(-0.006 * min(loss, 2500.0)))), 1)


def format_pv(board, pv):
    temp_board = board.copy()
    result = []

    for move in pv[:10]:
        try:
            if move not in temp_board.legal_moves:
                break

            result.append(temp_board.san(move))
            temp_board.push(move)

        except (ValueError, AssertionError):
            break

    return " ".join(result)


def get_multipv_lines(engine, board, depth=None):
    try:
        infos = engine.analyse(
            board,
            get_engine_limit(depth=depth),
            multipv=3
        )
    except Exception:
        return []

    if isinstance(infos, dict):
        infos = [infos]

    lines = []

    for info in infos:
        pv = info.get("pv")

        if not pv:
            continue

        score = info.get("score")

        if score is None:
            continue

        try:
            first_move = pv[0]

            if first_move not in board.legal_moves:
                continue

            parsed = parse_score(score.white())

            lines.append({
                "san": board.san(first_move),
                "uci": first_move.uci(),
                "pv": format_pv(board, pv),
                "eval": parsed["eval"],
                "is_mate": parsed["is_mate"],
                "mate_in": parsed["mate_in"]
            })

        except (ValueError, IndexError, AssertionError):
            continue

    return lines


def _info_score_sort_value(info, pov):
    score_obj = info.get("score")
    if score_obj is None:
        return -1e9
    try:
        value = score_obj.pov(pov).score(mate_score=MATE_SCORE)
        return float(value if value is not None else -1e9)
    except Exception:
        return -1e9


def get_position_analysis(engine, board):
    """Get up to three unique legal root lines with resilient MultiPV fallback."""
    limit = get_engine_limit()
    legal_moves = list(board.legal_moves)
    desired_count = min(3, len(legal_moves))

    try:
        raw = engine.analyse(
            board,
            limit,
            multipv=max(1, desired_count),
        )
    except Exception:
        raw = []

    if isinstance(raw, dict):
        raw = [raw]
    raw = list(raw or [])

    if desired_count == 0:
        # Terminal positions can still carry a useful mate/score but have no PV.
        return raw[:1]

    candidates = {}

    def collect(infos):
        if isinstance(infos, dict):
            infos = [infos]
        for info in infos or []:
            if not isinstance(info, dict) or info.get("score") is None:
                continue
            pv = info.get("pv") or []
            if not pv or pv[0] not in legal_moves:
                continue
            key = pv[0].uci()
            previous = candidates.get(key)
            if (
                previous is None
                or _info_score_sort_value(info, board.turn)
                > _info_score_sort_value(previous, board.turn)
            ):
                candidates[key] = info

    collect(raw)

    if len(candidates) < desired_count:
        try:
            collect(engine.analyse(
                board,
                limit,
                multipv=desired_count,
                root_moves=legal_moves,
            ))
        except Exception:
            pass

    if len(candidates) < desired_count:
        fallback_depth = max(8, min(11, int(ANALYSIS_DEPTH or 11)))
        fallback_time = max(0.045, min(0.10, float(ANALYSIS_TIME or 1.0) / 14.0))
        fallback_limit = chess.engine.Limit(
            depth=fallback_depth,
            time=fallback_time,
        )
        for move in legal_moves:
            if move.uci() in candidates:
                continue
            try:
                collect(engine.analyse(
                    board,
                    fallback_limit,
                    root_moves=[move],
                ))
            except Exception:
                continue
            if len(candidates) >= desired_count:
                break

    result = sorted(
        candidates.values(),
        key=lambda info: _info_score_sort_value(info, board.turn),
        reverse=True,
    )[:desired_count]

    # Preserve a score-only response if the engine did not produce a legal PV.
    return result or [info for info in raw if info.get("score") is not None][:1]


def format_multipv_infos(board, infos):
    """Format previously computed MultiPV infos without running Stockfish again."""
    if isinstance(infos, dict):
        infos = [infos]

    lines = []
    for info in infos or []:
        pv = info.get("pv") or []
        score_obj = info.get("score")
        if not pv or score_obj is None:
            continue
        first_move = pv[0]
        if first_move not in board.legal_moves:
            continue
        parsed = parse_score(score_obj.white())
        lines.append({
            "rank": len(lines) + 1,
            "san": board.san(first_move),
            "uci": first_move.uci(),
            "pv": format_pv(board, pv),
            "eval": parsed["eval"],
            "is_mate": parsed["is_mate"],
            "mate_in": parsed["mate_in"],
        })
    return lines[:3]


def get_best_move_info(infos):
    if not infos:
        return None

    for info in infos:
        if info.get("pv"):
            return info

    return None


def calculate_move_loss(before_info, after_info, mover):
    before_score = before_info.get("score")
    after_score = after_info.get("score")

    if before_score is None or after_score is None:
        return 0.0, 0.0, 0, 0

    before_cp = score_to_cp(before_score, mover)
    after_cp = score_to_cp(after_score, mover)

    before_ep = calc_expected_points(before_cp)
    after_ep = calc_expected_points(after_cp)

    loss = max(0.0, before_ep - after_ep)
    second_gap = 0.0

    return loss, second_gap, before_cp, after_cp


def get_second_best_gap(infos, mover):
    if len(infos) < 2:
        return 0.0

    first_score = infos[0].get("score")
    second_score = infos[1].get("score")

    if first_score is None or second_score is None:
        return 0.0

    first_ep = expected_points_from_score(first_score, mover)
    second_ep = expected_points_from_score(second_score, mover)

    return abs(first_ep - second_ep)


def safe_engine_quit(engine):
    if engine is not None:
        try:
            engine.quit()
        except Exception:
            pass