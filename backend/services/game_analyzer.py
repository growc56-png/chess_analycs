import io
import os

import chess
import chess.pgn
import chess.engine

from fastapi import HTTPException

from config import STOCKFISH_PATH, ANALYSIS_DEPTH, ANALYSIS_TIME

from services.stockfish import (
    ENGINE_LOCK,
    get_engine_limit,
    parse_score,
    score_to_cp,
    expected_points_from_score,
    get_multipv_lines,
    get_position_analysis,
    get_best_move_info,
    get_second_best_gap,
    safe_engine_quit,
)

from services.move_classifier import (
    classify_move,
    is_true_sacrifice,
)




def get_acceptable_move_candidates(board, infos, mover, expected_points_tolerance=0.02):
    """
    Возвращает несколько практически равноценных лучших ходов Stockfish.

    MultiPV может находить несколько форсированных матов. Все найденные
    выигрывающие матовые ходы считаются корректными альтернативами.
    В обычных позициях принимаем варианты, теряющие не более 2 п.п.
    ожидаемого результата относительно лучшего варианта.
    """
    if isinstance(infos, dict):
        infos = [infos]

    candidates = []
    seen = set()

    for info in infos or []:
        pv = info.get("pv") or []
        score_obj = info.get("score")
        if not pv or score_obj is None:
            continue

        first_move = pv[0]
        if first_move not in board.legal_moves or first_move.uci() in seen:
            continue

        try:
            side_score = score_obj.pov(mover)
            mate_distance = side_score.mate() if side_score.is_mate() else None
            winning_mate = (
                side_score.is_mate()
                and mate_distance is not None
                and mate_distance > 0
            )
            expected_points = expected_points_from_score(score_obj, mover)

            line_board = board.copy(stack=False)
            line_san = []
            line_uci = []
            for line_move in pv[:4]:
                if line_move not in line_board.legal_moves:
                    break
                line_san.append(line_board.san(line_move))
                line_uci.append(line_move.uci())
                line_board.push(line_move)

            motifs = get_tactical_motifs(
                board,
                first_move,
                mate_distance if winning_mate else None,
            )
            candidates.append({
                "uci": first_move.uci(),
                "san": board.san(first_move),
                "line_san": line_san[:4],
                "line_uci": line_uci[:4],
                "motifs": motifs,
                "expected_points": expected_points,
                "winning_mate": bool(winning_mate),
                "mate_in": mate_distance if winning_mate else None,
            })
            seen.add(first_move.uci())
        except (ValueError, AssertionError, AttributeError):
            continue

    if not candidates:
        return []

    best_expected_points = max(item["expected_points"] for item in candidates)
    best_has_forced_mate = any(
        item["winning_mate"]
        and item["expected_points"] >= best_expected_points - 1e-6
        for item in candidates
    )

    if best_has_forced_mate:
        accepted = [
            item for item in candidates
            if item["winning_mate"]
        ]
    else:
        accepted = [
            item for item in candidates
            if item["expected_points"] >= best_expected_points - expected_points_tolerance
        ]

    return accepted or [max(candidates, key=lambda item: item["expected_points"])]



def get_tactical_motifs(board, move, mate_in=None):
    """Отмечает короткие тактические идеи в ходе: шах, мат, вилка, связка."""
    mover = board.turn
    opponent = not mover
    after = board.copy(stack=False)

    try:
        after.push(move)
    except (ValueError, AssertionError):
        return []

    motifs = []
    moved_piece = after.piece_at(move.to_square)

    if after.is_checkmate():
        motifs.append("mate")
    elif after.is_check():
        motifs.append("check")

    if mate_in is not None and 0 < abs(int(mate_in)) <= 2:
        if "mate" not in motifs:
            motifs.append("mate_in_2")

    if moved_piece is not None:
        attacked_targets = []
        for square, target_piece in after.piece_map().items():
            if target_piece.color != opponent or target_piece.piece_type == chess.KING:
                continue
            if target_piece.piece_type not in (
                chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN
            ):
                continue
            if move.to_square in after.attackers(mover, square):
                attacked_targets.append(square)

        checked_king = after.king(opponent)
        checking_piece_is_moved_piece = bool(
            checked_king is not None
            and move.to_square in after.attackers(mover, checked_king)
        )
        fork_targets = len(attacked_targets) + (1 if after.is_check() and checking_piece_is_moved_piece else 0)
        if fork_targets >= 2:
            motifs.append("fork")

    newly_pinned = []
    for square, target_piece in after.piece_map().items():
        if target_piece.color != opponent or target_piece.piece_type == chess.KING:
            continue
        if after.is_pinned(opponent, square) and not board.is_pinned(opponent, square):
            newly_pinned.append(square)
    if newly_pinned:
        motifs.append("pin")

    if after.is_check() and moved_piece is not None and "check" in motifs:
        attackers = after.attackers(mover, after.king(opponent))
        if any(square != move.to_square for square in attackers):
            motifs.append("discovered_check")

    if board.is_capture(move):
        motifs.append("capture")

    # Сохраняем порядок и удаляем дубликаты.
    return list(dict.fromkeys(motifs))

def analyze_game(pgn, progress_callback=None, book_move_checker=None):

    with ENGINE_LOCK:
        engine = None

        try:
            if not pgn or not pgn.strip():
                raise HTTPException(
                    status_code=400,
                    detail="PGN пустой"
                )

            game = chess.pgn.read_game(io.StringIO(pgn))

            if game is None:
                raise HTTPException(
                    status_code=400,
                    detail="Не удалось прочитать PGN"
                )

            if game.errors:
                raise HTTPException(
                    status_code=400,
                    detail="Ошибка в PGN: " + str(game.errors[0])
                )

            if not os.path.exists(STOCKFISH_PATH):
                raise HTTPException(
                    status_code=500,
                    detail="Stockfish не найден: " + str(STOCKFISH_PATH)
                )

            white_player = game.headers.get("White", "White")
            black_player = game.headers.get("Black", "Black")

            time_control = game.headers.get("TimeControl", "")
            initial_clock = None

            try:
                first_control = time_control.split(":", 1)[0]
                base_part = first_control.split("+", 1)[0]

                if base_part.isdigit():
                    initial_clock = float(base_part)

            except Exception:
                initial_clock = None

            board = game.board()

            moves_data = []
            history_san = []
            evals = []

            total_moves = len(list(game.mainline_moves()))

            try:
                engine = chess.engine.SimpleEngine.popen_uci(
                    str(STOCKFISH_PATH)
                )
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Ошибка запуска Stockfish: {e}"
                )

            try:
                engine.configure({
                    "Threads": max(1, min(4, os.cpu_count() or 1)),
                    "Hash": 256
                })
            except Exception:
                pass

            prev_infos = get_position_analysis(engine, board)

            if not prev_infos:
                raise HTTPException(
                    status_code=500,
                    detail="Stockfish не вернул начальную оценку"
                )

            node = game

            for i, move in enumerate(game.mainline_moves()):

                node = node.next() if node else None

                if move not in board.legal_moves:
                    break

                mover = board.turn

                before_infos = prev_infos
                best_info = get_best_move_info(before_infos)

                if best_info is None:
                    break

                best_pv = best_info.get("pv") or []

                best_move_uci = (
                    best_pv[0].uci()
                    if best_pv
                    else None
                )

                acceptable_move_candidates = get_acceptable_move_candidates(
                    board,
                    before_infos,
                    mover
                )
                acceptable_moves_uci = [
                    item["uci"] for item in acceptable_move_candidates
                ]
                acceptable_move_by_uci = {
                    item["uci"]: item for item in acceptable_move_candidates
                }
                is_best = move.uci() in acceptable_moves_uci
                accepted_candidate = acceptable_move_by_uci.get(move.uci())
                is_accepted_winning_mate = bool(
                    accepted_candidate and accepted_candidate["winning_mate"]
                )
                is_forced = board.legal_moves.count() == 1

                san_move = board.san(move)
                # Сохраняем позицию до хода и лучший ход Stockfish:
                # эти данные нужны персональной тренировке ошибок.
                before_fen = board.fen()
                best_move_san = board.san(best_pv[0]) if best_pv and best_pv[0] in board.legal_moves else None
                best_line_san = []
                if best_pv:
                    best_line_board = board.copy(stack=False)
                    for pv_move in best_pv[:6]:
                        if pv_move not in best_line_board.legal_moves:
                            break
                        best_line_san.append(best_line_board.san(pv_move))
                        best_line_board.push(pv_move)
                history_san.append(san_move)

                is_book = (
                    book_move_checker(history_san)
                    if book_move_checker
                    else False
                )

                is_sacrifice = is_true_sacrifice(board, move)

                second_best_gap = get_second_best_gap(
                    before_infos,
                    mover
                )

                clock_before = node.clock() if node else None

                board.push(move)

                clock_after = node.clock() if node else None

                time_spent = None

                if (
                    clock_before is not None
                    and clock_after is not None
                ):
                    time_spent = max(
                        0,
                        clock_before - clock_after
                    )

                after_info = engine.analyse(
                    board,
                    get_engine_limit(),
                    multipv=1
                )

                if isinstance(after_info, list):
                    after_info = after_info[0]

                after_score = after_info.get("score")

                if after_score is None:
                    curr_parsed = {
                        "eval": 0,
                        "is_mate": False,
                        "mate_in": 0
                    }
                else:
                    curr_parsed = parse_score(after_score.white())

                curr_eval = curr_parsed["eval"]
                before_score = best_info.get("score")

                if before_score is not None and after_score is not None:

                    before_ep = expected_points_from_score(
                        before_score,
                        mover
                    )

                    after_ep = expected_points_from_score(
                        after_score,
                        mover
                    )

                    win_percent_loss = max(
                        0.0,
                        before_ep - after_ep
                    )

                    before_cp = score_to_cp(
                        before_score,
                        mover
                    )

                    after_cp = score_to_cp(
                        after_score,
                        mover
                    )

                    centipawn_loss = max(
                        0,
                        before_cp - after_cp
                    )

                else:
                    win_percent_loss = 0.0
                    centipawn_loss = 0

                # Если сыгран один из равноценных вариантов MultiPV, не
                # наказываем его из-за небольшого разброса оценок движка.
                if is_best and not is_accepted_winning_mate:
                    win_percent_loss = min(win_percent_loss, 0.02)
                elif is_accepted_winning_mate:
                    win_percent_loss = 0.0
                    centipawn_loss = 0

                if is_book:
                    classification = "book"
                else:
                    mate_won = True

                    if after_score is not None and after_score.is_mate():
                        mate_distance = after_score.pov(mover).mate()

                        mate_won = (
                            mate_distance is not None
                            and mate_distance > 0
                        )

                    classification = classify_move(
                        win_percent_loss=win_percent_loss,
                        is_best=is_best,
                        is_sacrifice=is_sacrifice,
                        is_forced=is_forced,
                        prev_eval=(
                            score_to_cp(before_score, mover) / 100
                            if before_score else 0
                        ),
                        curr_eval=(
                            score_to_cp(after_score, mover) / 100
                            if after_score else 0
                        ),
                        second_best_gap=second_best_gap,
                        is_mate=curr_parsed["is_mate"],
                        mate_won=mate_won
                    )

                next_top_moves = get_multipv_lines(
                    engine,
                    board
                )

                moves_data.append({
                    "move_num": board.fullmove_number,
                    "san": san_move,
                    "eval": curr_eval,
                    "uci": move.uci(),
                    "before_fen": before_fen,
                    "best_move_uci": best_move_uci,
                    "best_move_san": best_move_san,
                    "best_line_san": best_line_san,
                    "best_line_uci": [item.uci() for item in best_pv[:4]],
                    "best_move_motifs": (
                        acceptable_move_by_uci.get(best_move_uci, {}).get("motifs", [])
                        if best_move_uci else []
                    ),
                    "acceptable_moves": [
                        {
                            "uci": item["uci"],
                            "san": item["san"],
                            "line_san": item["line_san"],
                            "line_uci": item["line_uci"],
                            "motifs": item["motifs"],
                            "winning_mate": item["winning_mate"],
                            "mate_in": item["mate_in"],
                        }
                        for item in acceptable_move_candidates
                    ],
                    "acceptable_moves_uci": acceptable_moves_uci,
                    "mover": "white" if mover == chess.WHITE else "black",
                    "is_mate": curr_parsed["is_mate"],
                    "mate_in": curr_parsed["mate_in"],
                    "cp_loss": int(centipawn_loss),
                    "centipawn_loss": centipawn_loss,
                    "win_percent_loss": round(
                        win_percent_loss * 100,
                        2
                    ),
                    "classification": classification,
                    "fen": board.fen(),
                    "next_top_moves": next_top_moves,
                    "clock_after": clock_after,
                    "time_spent": time_spent
                })

                graph_eval = max(
                    -10,
                    min(10, curr_eval)
                )

                evals.append(graph_eval)

                prev_infos = get_position_analysis(
                    engine,
                    board
                )

                if progress_callback:
                    progress_callback(
                        len(moves_data),
                        total_moves
                    )

                if not prev_infos:
                    break

            return {
                "moves": moves_data,
                "white_player": white_player,
                "black_player": black_player,
                "time_control": time_control,
                "initial_clock": initial_clock,
                "evals": evals,
                "analysis_depth": ANALYSIS_DEPTH,
                "analysis_time": ANALYSIS_TIME
            }

        except HTTPException:
            raise

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Ошибка анализа партии: {str(e)}"
            )

        finally:
            safe_engine_quit(engine)