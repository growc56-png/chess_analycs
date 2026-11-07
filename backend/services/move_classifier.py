import chess

from services.stockfish import PIECE_VALUES


def get_sacrifice_details(board_before, move):
    """Detect a valuable piece offer, including capture-then-sacrifice moves.

    A move such as Qxc6+ can win a minor piece and still offer the queen
    to a pawn. It is a real sacrifice when the offered piece's value exceeds
    the value captured; Stockfish verifies the compensation afterwards.
    """
    piece = board_before.piece_at(move.from_square)
    if piece is None or piece.piece_type in (chess.PAWN, chess.KING):
        return None

    moving_value = PIECE_VALUES.get(piece.piece_type, 0)
    if moving_value <= 0:
        return None

    captured_piece = board_before.piece_at(move.to_square)
    if board_before.is_en_passant(move):
        captured_piece = chess.Piece(chess.PAWN, not piece.color)
    captured_value = (
        PIECE_VALUES.get(captured_piece.piece_type, 0)
        if captured_piece is not None else 0
    )
    # Ordinary exchanges/captures are not sacrifices: the value offered
    # must be greater than the value won by the move.
    if moving_value <= captured_value:
        return None

    after = board_before.copy(stack=True)
    mover = board_before.turn
    try:
        after.push(move)
    except (ValueError, AssertionError):
        return None

    target = move.to_square
    opponent = not mover
    if not after.is_attacked_by(opponent, target):
        return None

    capture_replies = []
    for reply in after.legal_moves:
        if reply.to_square != target:
            continue
        target_piece = after.piece_at(target)
        attacker = after.piece_at(reply.from_square)
        if (
            target_piece is None
            or target_piece.color != mover
            or attacker is None
        ):
            continue
        capture_replies.append({
            "uci": reply.uci(),
            "san": after.san(reply),
            "attacker": chess.piece_name(attacker.piece_type),
            "attacker_value": PIECE_VALUES.get(attacker.piece_type, 0),
        })

    return {
        "piece": chess.piece_name(piece.piece_type),
        "piece_symbol": piece.symbol(),
        "captured_piece": (
            chess.piece_name(captured_piece.piece_type)
            if captured_piece is not None else None
        ),
        "captured_symbol": (
            captured_piece.symbol() if captured_piece is not None else None
        ),
        "recapture_san": capture_replies[0]["san"] if capture_replies else None,
        "attacker": capture_replies[0]["attacker"] if capture_replies else None,
        "capture_uci": [item["uci"] for item in capture_replies],
        "capture_replies": capture_replies,
        "material_difference": moving_value - captured_value,
    }


def is_true_sacrifice(board_before, move):
    """Backward-compatible boolean sacrifice check."""
    return get_sacrifice_details(board_before, move) is not None


def classify_move(
    win_percent_loss,
    is_best,
    is_sacrifice,
    is_forced,
    prev_eval,
    curr_eval,
    second_best_gap,
    is_mate=False,
    mate_won=True,
    missed_tactic=False,
):
    """Classify a played move using the expected-points loss.

    win_percent_loss is a fraction in [0, 1], not a percentage. The caller
    computes it from the same Stockfish score scale before and after the move.
    Thresholds are explicit heuristics; this is not Chess.com's proprietary
    CAPS2 formula.
    """
    loss = max(0.0, min(1.0, float(win_percent_loss or 0.0)))

    # A verified sacrifice that forces mate remains Brilliant; do not
    # downgrade it to "best" merely because the resulting position is mate.
    if is_mate and mate_won and is_sacrifice and is_best and loss <= 0.01:
        return "brilliant"

    if is_mate:
        return "best" if mate_won and loss <= 0.02 else "blunder"

    if is_forced:
        return "forced"

    # A Brilliant move must be both a genuine quiet sacrifice and close to
    # the engine's best continuation after the critical-position recheck.
    if is_sacrifice and is_best and loss <= 0.01:
        return "brilliant"

    # "Miss" is reserved for a missed concrete tactical opportunity, not
    # every ordinary inaccuracy in a position with a small edge.
    if missed_tactic and 0.02 <= loss < 0.20:
        return "miss"

    # Great is a near-best move in a position where the second choice was
    # materially worse: a difficult/unique decision, not simply any best move.
    if is_best and loss <= 0.005 and second_best_gap >= 0.12:
        return "great"

    if loss <= 0.005:
        return "best"
    if loss <= 0.02:
        return "excellent"
    if loss <= 0.05:
        return "good"
    if loss <= 0.10:
        return "inaccuracy"
    if loss <= 0.20:
        return "mistake"

    return "blunder"
