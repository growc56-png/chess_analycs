import chess

from services.stockfish import PIECE_VALUES


def is_true_sacrifice(board_before, move):
    """
    Проверяет, может ли соперник легально взять переместившуюся фигуру.
    Обычные взятия и ходы пешками жертвами не считаются.
    """

    piece = board_before.piece_at(move.from_square)

    if piece is None:
        return False

    if piece.piece_type in (chess.PAWN, chess.KING):
        return False

    captured = board_before.piece_at(move.to_square)

    captured_value = (
        PIECE_VALUES.get(captured.piece_type, 0)
        if captured else 0
    )

    moving_value = PIECE_VALUES.get(piece.piece_type, 0)

    if captured_value >= moving_value:
        return False

    after = board_before.copy()
    mover = board_before.turn

    try:
        after.push(move)
    except ValueError:
        return False

    target = move.to_square
    opponent = not mover

    if not after.is_attacked_by(opponent, target):
        return False

    for reply in after.legal_moves:
        if reply.to_square != target:
            continue

        captured_piece = after.piece_at(target)

        if captured_piece and captured_piece.color == mover:
            return True

    return False


def classify_move(
    win_percent_loss,
    is_best,
    is_sacrifice,
    is_forced,
    prev_eval,
    curr_eval,
    second_best_gap,
    is_mate=False,
    mate_won=True
):
    """
    Классификация по потере ожидаемого результата.
    Пороговые значения сохранены без изменений.
    """

    loss = max(0.0, float(win_percent_loss or 0.0))

    if is_mate:
        return "best" if mate_won and loss <= 0.02 else "blunder"

    if is_forced:
        return "forced"

    if (
        is_best
        and is_sacrifice
        and loss <= 0.005
        and second_best_gap >= 0.20
        and -5.0 <= prev_eval <= 5.0
    ):
        return "brilliant"

    if is_best and loss <= 0.005 and second_best_gap >= 0.15:
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