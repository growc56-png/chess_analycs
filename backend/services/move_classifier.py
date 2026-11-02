import chess

from services.stockfish import PIECE_VALUES


def get_sacrifice_details(board_before, move):
    """
    Описывает тихую жертву: ход фигурой без взятия,
    после которого соперник может легально забрать эту фигуру.

    Сам факт жертвы ещё не делает ход хорошим. Его качество подтверждается
    отдельно: Stockfish должен оценить сыгранный ход почти наравне с лучшим.
    """
    piece = board_before.piece_at(move.from_square)
    if piece is None or piece.piece_type in (chess.PAWN, chess.KING):
        return None

    captured = board_before.piece_at(move.to_square)

    # Взятие с последующим разменом — это не жертва.
    # Бриллиантовый ход должен быть тихим предложением материала,
    # а не обычной последовательностью «взял — меня взяли».
    if captured is not None or board_before.is_en_passant(move):
        return None

    moving_value = PIECE_VALUES.get(piece.piece_type, 0)
    if moving_value <= 0:
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

    for reply in after.legal_moves:
        if reply.to_square != target:
            continue

        target_piece = after.piece_at(target)
        if target_piece is None or target_piece.color != mover:
            continue

        attacker = after.piece_at(reply.from_square)
        if attacker is None:
            continue

        return {
            "piece": chess.piece_name(piece.piece_type),
            "piece_symbol": piece.symbol(),
            "captured_piece": None,
            "captured_symbol": None,
            "recapture_san": after.san(reply),
            "attacker": chess.piece_name(attacker.piece_type),
            "material_difference": moving_value - captured_value,
        }

    return None


def is_true_sacrifice(board_before, move):
    """Совместимый булевый интерфейс проверки жертвы."""
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
    mate_won=True
):
    """
    Классифицирует ход по потере ожидаемого результата.

    Бриллиантовый ход — почти лучший ход движка с реальной жертвой фигуры.
    Условия по разрыву со вторым вариантом и абсолютной оценке позиции
    намеренно не используются: они необоснованно отсеивали хорошие жертвы.
    """
    loss = max(0.0, float(win_percent_loss or 0.0))

    if is_mate:
        return "best" if mate_won and loss <= 0.02 else "blunder"

    if is_forced:
        return "forced"

    # is_best означает, что сыгранный ход входит в набор практически
    # равноценных лучших вариантов Stockfish. Дополнительно ограничиваем
    # потерю ожидаемого результата одним процентным пунктом.
    if is_best and is_sacrifice and loss <= 0.01:
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
