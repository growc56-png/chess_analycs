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

                is_best = best_move_uci == move.uci()
                is_forced = board.legal_moves.count() == 1

                san_move = board.san(move)
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