import io
import os

import chess
import chess.pgn
import chess.engine

from fastapi import HTTPException

from config import (
    STOCKFISH_PATH,
    ANALYSIS_DEPTH,
    ANALYSIS_TIME,
    DEEP_ANALYSIS_DEPTH,
    DEEP_ANALYSIS_TIME,
    MAX_DEEP_ANALYSIS_MOVES,
)

from services.stockfish import (
    ENGINE_LOCK,
    get_engine_limit,
    parse_score,
    score_to_cp,
    expected_points_from_score,
    accuracy_from_centipawn_loss,
    format_multipv_infos,
    get_position_analysis,
    get_best_move_info,
    get_second_best_gap,
    safe_engine_quit,
)

from services.move_classifier import (
    classify_move,
    get_sacrifice_details,
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

def _normalise_engine_infos(infos):
    if isinstance(infos, dict):
        return [infos]
    return list(infos or [])


def _calculate_loss_metrics(before_score, after_score, mover):
    """Return expected-points loss (0..1), centipawn loss and both scores."""
    if before_score is None or after_score is None:
        return 0.0, 0, 0, 0

    before_cp = score_to_cp(before_score, mover)
    after_cp = score_to_cp(after_score, mover)
    before_points = expected_points_from_score(before_score, mover)
    after_points = expected_points_from_score(after_score, mover)

    return (
        max(0.0, before_points - after_points),
        max(0, before_cp - after_cp),
        before_cp,
        after_cp,
    )


def _classify_game_phase(board):
    """Approximate phase from remaining non-pawn material."""
    phase_weights = {
        chess.KNIGHT: 1,
        chess.BISHOP: 1,
        chess.ROOK: 2,
        chess.QUEEN: 4,
    }
    phase_score = sum(
        phase_weights.get(piece.piece_type, 0)
        for piece in board.piece_map().values()
    )
    if phase_score <= 8:
        return "endgame"
    if board.fullmove_number <= 12 and phase_score >= 16:
        return "opening"
    return "middlegame"


def _parse_time_control(time_control):
    """Return (initial seconds, increment seconds) from common PGN TimeControl."""
    if not time_control:
        return None, 0.0

    first_stage = str(time_control).split(":", 1)[0].strip()
    parts = first_stage.split("+", 1)
    base_part = parts[0].strip().split("/")[-1].strip()
    increment_part = parts[1].strip() if len(parts) > 1 else "0"

    try:
        initial = float(base_part)
        increment = float(increment_part or 0)
        if initial < 0 or increment < 0:
            return None, 0.0
        return initial, increment
    except (TypeError, ValueError):
        return None, 0.0


def _is_time_pressure(clock_before, initial_clock, time_spent):
    if clock_before is None:
        return False
    try:
        remaining = max(0.0, float(clock_before))
    except (TypeError, ValueError):
        return False

    if initial_clock is None or initial_clock <= 0:
        return remaining <= 20.0
    return (
        remaining <= max(15.0, initial_clock * 0.12)
        or (
            time_spent is not None
            and time_spent >= max(20.0, initial_clock * 0.20)
        )
    )


TACTICAL_MISS_MOTIFS = {
    "mate",
    "mate_in_2",
    "fork",
    "pin",
    "discovered_check",
}


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
            initial_clock, time_increment = _parse_time_control(time_control)

            board = game.board()

            moves_data = []
            history_san = []
            evals = []
            deep_positions_checked = 0

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
            previous_clocks = {
                chess.WHITE: initial_clock,
                chess.BLACK: initial_clock,
            }

            for i, move in enumerate(game.mainline_moves()):

                node = node.next() if node else None

                if move not in board.legal_moves:
                    break

                mover = board.turn
                before_board = board.copy(stack=True)
                move_number = before_board.fullmove_number
                phase = _classify_game_phase(before_board)

                before_infos = prev_infos
                best_info = get_best_move_info(before_infos)
                if best_info is None:
                    break

                best_pv = best_info.get("pv") or []
                best_move_uci = best_pv[0].uci() if best_pv else None

                acceptable_move_candidates = get_acceptable_move_candidates(
                    before_board,
                    before_infos,
                    mover,
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
                is_forced = before_board.legal_moves.count() == 1

                san_move = before_board.san(move)
                before_fen = before_board.fen()
                best_move_san = (
                    before_board.san(best_pv[0])
                    if best_pv and best_pv[0] in before_board.legal_moves
                    else None
                )
                best_line_san = []
                if best_pv:
                    best_line_board = before_board.copy(stack=False)
                    for pv_move in best_pv[:6]:
                        if pv_move not in best_line_board.legal_moves:
                            break
                        best_line_san.append(best_line_board.san(pv_move))
                        best_line_board.push(pv_move)

                best_move_motifs = (
                    acceptable_move_by_uci.get(best_move_uci, {}).get("motifs", [])
                    if best_move_uci else []
                )

                history_san.append(san_move)
                is_book = (
                    book_move_checker(history_san)
                    if book_move_checker else False
                )

                sacrifice_details = get_sacrifice_details(before_board, move)
                is_sacrifice = sacrifice_details is not None
                second_best_gap = get_second_best_gap(before_infos, mover)

                # PGN [%clk] is attached to the node after the move.
                # Compare it with the previous node's remaining time and add
                # the increment to avoid treating the same clock as before/after.
                clock_before = previous_clocks.get(mover)
                board.push(move)
                clock_after = node.clock() if node else None
                time_spent = None
                if clock_after is not None:
                    if clock_before is not None:
                        time_spent = max(
                            0.0,
                            clock_before + time_increment - clock_after,
                        )
                    previous_clocks[mover] = clock_after

                # One MultiPV evaluation after the played move is reused
                # for its graph score, the top lines and the next loop's
                # pre-move position. This avoids duplicate searches.
                after_infos = _normalise_engine_infos(
                    get_position_analysis(engine, board)
                )
                after_info = after_infos[0] if after_infos else {}
                after_score = after_info.get("score")
                before_score = best_info.get("score")

                win_points_loss, centipawn_loss, before_cp, after_cp = (
                    _calculate_loss_metrics(before_score, after_score, mover)
                )

                # The fast pass identifies positions worth a more expensive
                # check. We always recheck sacrifices, missed tactical chances,
                # mate positions and clear evaluation swings.
                preliminary_tactical = bool(
                    set(best_move_motifs) & TACTICAL_MISS_MOTIFS
                )
                preliminary_mate = bool(
                    before_score is not None and before_score.is_mate()
                ) or bool(after_score is not None and after_score.is_mate())
                deep_reason = None
                if is_sacrifice:
                    deep_reason = "sacrifice"
                elif win_points_loss >= 0.025:
                    deep_reason = "evaluation_drop"
                elif preliminary_tactical and move.uci() != best_move_uci:
                    deep_reason = "missed_tactic"
                elif preliminary_mate:
                    deep_reason = "mate_position"

                deep_analysis_performed = False
                sacrifice_confirmed = False
                analysis_depth_used = int(best_info.get("depth") or ANALYSIS_DEPTH)
                if (
                    deep_reason
                    and deep_positions_checked < MAX_DEEP_ANALYSIS_MOVES
                    and before_board.legal_moves.count() > 0
                ):
                    deep_positions_checked += 1
                    try:
                        deep_limit = get_engine_limit(
                            depth=DEEP_ANALYSIS_DEPTH,
                            time_limit=DEEP_ANALYSIS_TIME,
                        )
                        deep_before_infos = engine.analyse(
                            before_board,
                            deep_limit,
                            multipv=min(3, before_board.legal_moves.count()),
                        )
                        deep_before_infos = _normalise_engine_infos(deep_before_infos)
                        deep_best_info = get_best_move_info(deep_before_infos)
                        deep_after_info = engine.analyse(
                            board,
                            deep_limit,
                            multipv=1,
                        )
                        deep_after_infos = _normalise_engine_infos(deep_after_info)
                        deep_after_info = deep_after_infos[0] if deep_after_infos else {}

                        # A piece being attacked is not enough for a Brilliant.
                        # Test every legal capture of the offered piece at the
                        # deep limit. If the opponent can accept it without
                        # giving up at least 2.5 expected-points, it is not a
                        # sound sacrifice and must not receive the Brilliant label.
                        if is_sacrifice and sacrifice_details and deep_after_info.get("score") is not None:
                            capture_moves = sacrifice_details.get("capture_uci") or []
                            best_reply_points = expected_points_from_score(
                                deep_after_info["score"],
                                mover,
                            )
                            capture_points = []
                            for capture_uci in capture_moves:
                                try:
                                    capture_move = chess.Move.from_uci(capture_uci)
                                    if capture_move not in board.legal_moves:
                                        continue
                                    capture_info = engine.analyse(
                                        board,
                                        deep_limit,
                                        root_moves=[capture_move],
                                    )
                                    if isinstance(capture_info, list):
                                        capture_info = capture_info[0] if capture_info else {}
                                    capture_score = capture_info.get("score") if capture_info else None
                                    if capture_score is not None:
                                        capture_points.append(
                                            expected_points_from_score(capture_score, mover)
                                        )
                                except Exception:
                                    continue

                            # One safe/near-best capture is enough to disprove
                            # the claim that the move offered a sound sacrifice.
                            sacrifice_confirmed = (
                                len(capture_points) == len(capture_moves)
                                and bool(capture_points)
                                and all(
                                    points > best_reply_points + 0.025
                                    for points in capture_points
                                )
                            )

                        if deep_best_info and deep_after_info.get("score") is not None:
                            deep_best_pv = deep_best_info.get("pv") or []
                            deep_best_score = deep_best_info.get("score")
                            deep_after_score = deep_after_info.get("score")

                            (
                                deep_loss,
                                deep_cp_loss,
                                deep_before_cp,
                                deep_after_cp,
                            ) = _calculate_loss_metrics(
                                deep_best_score,
                                deep_after_score,
                                mover,
                            )

                            deep_candidates = get_acceptable_move_candidates(
                                before_board,
                                deep_before_infos,
                                mover,
                            )
                            deep_candidate_map = {
                                item["uci"]: item for item in deep_candidates
                            }
                            deep_acceptable_uci = [
                                item["uci"] for item in deep_candidates
                            ]

                            best_info = deep_best_info
                            best_pv = deep_best_pv
                            before_score = deep_best_score
                            after_score = deep_after_score
                            best_move_uci = (
                                deep_best_pv[0].uci() if deep_best_pv else None
                            )
                            best_move_san = (
                                before_board.san(deep_best_pv[0])
                                if deep_best_pv and deep_best_pv[0] in before_board.legal_moves
                                else None
                            )
                            best_line_san = []
                            if deep_best_pv:
                                deep_line_board = before_board.copy(stack=False)
                                for pv_move in deep_best_pv[:6]:
                                    if pv_move not in deep_line_board.legal_moves:
                                        break
                                    best_line_san.append(deep_line_board.san(pv_move))
                                    deep_line_board.push(pv_move)

                            acceptable_move_candidates = deep_candidates
                            acceptable_move_by_uci = deep_candidate_map
                            acceptable_moves_uci = deep_acceptable_uci
                            is_best = move.uci() in deep_acceptable_uci
                            accepted_candidate = deep_candidate_map.get(move.uci())
                            is_accepted_winning_mate = bool(
                                accepted_candidate and accepted_candidate["winning_mate"]
                            )
                            best_move_motifs = (
                                deep_candidate_map.get(best_move_uci, {}).get("motifs", [])
                                if best_move_uci else []
                            )
                            second_best_gap = get_second_best_gap(
                                deep_before_infos,
                                mover,
                            )
                            win_points_loss = deep_loss
                            centipawn_loss = deep_cp_loss
                            before_cp = deep_before_cp
                            after_cp = deep_after_cp
                            deep_depths = [
                                int(value)
                                for value in (
                                    deep_best_info.get("depth"),
                                    deep_after_info.get("depth"),
                                )
                                if value is not None
                            ]
                            analysis_depth_used = min(deep_depths) if deep_depths else DEEP_ANALYSIS_DEPTH
                            deep_analysis_performed = True
                    except Exception:
                        # A deep-pass failure must not discard the valid fast
                        # analysis for the rest of the game.
                        deep_analysis_performed = False

                # Only a deep-engine-confirmed sacrifice can be Brilliant.
                is_sacrifice = bool(
                    is_sacrifice
                    and deep_analysis_performed
                    and sacrifice_confirmed
                )

                if is_accepted_winning_mate or is_forced:
                    # Accepted mating alternatives and sole legal moves should
                    # not be penalised for engine horizon noise.
                    win_points_loss = 0.0
                    centipawn_loss = 0

                if after_score is None:
                    curr_parsed = {
                        "eval": 0,
                        "is_mate": False,
                        "mate_in": 0,
                    }
                else:
                    curr_parsed = parse_score(after_score.white())
                curr_eval = curr_parsed["eval"]
                # Store every move's resulting evaluation from White's point of view.
                eval_after_white = curr_parsed["eval"]
                eval_after_is_mate = curr_parsed["is_mate"]
                eval_after_mate_in = curr_parsed["mate_in"]

                missed_tactic = (
                    not is_best
                    and move.uci() != best_move_uci
                    and bool(set(best_move_motifs) & TACTICAL_MISS_MOTIFS)
                )

                mate_won = True
                if after_score is not None and after_score.is_mate():
                    mate_distance = after_score.pov(mover).mate()
                    mate_won = mate_distance is not None and mate_distance > 0

                if is_book and win_points_loss <= 0.015:
                    classification = "book"
                else:
                    classification = classify_move(
                        win_percent_loss=win_points_loss,
                        is_best=is_best,
                        is_sacrifice=(is_sacrifice and deep_analysis_performed),
                        is_forced=is_forced,
                        prev_eval=(before_cp / 100.0),
                        curr_eval=(after_cp / 100.0),
                        second_best_gap=second_best_gap,
                        is_mate=curr_parsed["is_mate"],
                        mate_won=mate_won,
                        missed_tactic=missed_tactic,
                    )

                time_pressure = _is_time_pressure(
                    clock_before,
                    initial_clock,
                    time_spent,
                )
                next_top_moves = format_multipv_infos(
                    board,
                    after_infos,
                )

                moves_data.append({
                    "move_num": move_number,
                    "san": san_move,
                    "eval": curr_eval,
                    "eval_after_white": eval_after_white,
                    "eval_after_is_mate": eval_after_is_mate,
                    "eval_after_mate_in": eval_after_mate_in,
                    "uci": move.uci(),
                    "before_fen": before_fen,
                    "best_move_uci": best_move_uci,
                    "best_move_san": best_move_san,
                    "best_line_san": best_line_san,
                    "best_line_uci": [item.uci() for item in best_pv[:4]],
                    "best_move_motifs": best_move_motifs,
                    "missed_tactic": missed_tactic,
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
                        win_points_loss * 100,
                        2
                    ),
                    "move_accuracy": accuracy_from_centipawn_loss(centipawn_loss),
                    "move_accuracy_version": 3,
                    "classification": classification,
                    "phase": phase,
                    "deep_analysis": deep_analysis_performed,
                    "deep_analysis_reason": deep_reason if deep_analysis_performed else None,
                    "analysis_depth_used": analysis_depth_used,
                    "is_time_pressure": time_pressure,
                    "clock_before": clock_before,
                    "is_sacrifice": is_sacrifice,
                    "sacrifice_details": sacrifice_details,
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

                prev_infos = after_infos

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
                "analysis_time": ANALYSIS_TIME,
                "deep_analysis_depth": DEEP_ANALYSIS_DEPTH,
                "deep_analysis_time": DEEP_ANALYSIS_TIME,
                "deep_positions_checked": deep_positions_checked,
                "analysis_profile": "two_pass_centipawn_accuracy_v3"
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