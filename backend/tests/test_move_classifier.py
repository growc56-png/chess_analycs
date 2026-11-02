"""Regression tests for move-quality and sacrifice classification.

Run from the backend directory:
    python -m unittest discover -s tests
"""

import unittest

import chess

from services.move_classifier import (
    classify_move,
    get_sacrifice_details,
    is_true_sacrifice,
)
from services.game_analyzer import (
    _classify_game_phase,
    _parse_time_control,
)
from services.stockfish import (
    calc_expected_points,
    get_position_analysis,
    format_multipv_infos,
)


class SacrificeDetectionTests(unittest.TestCase):
    def test_quiet_rook_offer_with_legal_pawn_capture_is_a_sacrifice(self):
        board = chess.Board("7k/8/8/1p6/8/8/8/R6K w - - 0 1")
        move = board.parse_san("Ra4")

        details = get_sacrifice_details(board, move)

        self.assertIsNotNone(details)
        self.assertEqual(details["piece"], "rook")
        self.assertEqual(details["recapture_san"], "bxa4")
        self.assertEqual(details["material_difference"], 5)
        self.assertTrue(is_true_sacrifice(board, move))

    def test_capture_followed_by_recapture_is_not_a_sacrifice(self):
        board = chess.Board("7k/8/8/8/pr6/8/8/R6K w - - 0 1")
        move = board.parse_san("Rxa4")

        self.assertIsNone(get_sacrifice_details(board, move))
        self.assertFalse(is_true_sacrifice(board, move))

    def test_pawn_move_is_not_a_brilliant_material_sacrifice(self):
        board = chess.Board("7k/8/8/1p6/8/8/P7/7K w - - 0 1")
        move = board.parse_san("a4")
        self.assertIsNone(get_sacrifice_details(board, move))


class MoveClassificationTests(unittest.TestCase):
    def test_brilliant_requires_a_confirmed_sacrifice_and_low_loss(self):
        self.assertEqual(
            classify_move(
                win_percent_loss=0.008,
                is_best=True,
                is_sacrifice=True,
                is_forced=False,
                prev_eval=0.0,
                curr_eval=0.0,
                second_best_gap=0.0,
            ),
            "brilliant",
        )

    def test_an_ordinary_capture_cannot_become_brilliant_without_sacrifice_flag(self):
        result = classify_move(
            win_percent_loss=0.001,
            is_best=True,
            is_sacrifice=False,
            is_forced=False,
            prev_eval=0.0,
            curr_eval=0.0,
            second_best_gap=0.0,
        )
        self.assertEqual(result, "best")

    def test_missed_tactic_is_distinct_from_a_blunder(self):
        self.assertEqual(
            classify_move(
                win_percent_loss=0.06,
                is_best=False,
                is_sacrifice=False,
                is_forced=False,
                prev_eval=0.5,
                curr_eval=-0.5,
                second_best_gap=0.0,
                missed_tactic=True,
            ),
            "miss",
        )
        self.assertEqual(
            classify_move(
                win_percent_loss=0.25,
                is_best=False,
                is_sacrifice=False,
                is_forced=False,
                prev_eval=0.5,
                curr_eval=-2.0,
                second_best_gap=0.0,
                missed_tactic=True,
            ),
            "blunder",
        )

    def test_forced_move_is_not_penalized(self):
        self.assertEqual(
            classify_move(
                win_percent_loss=0.8,
                is_best=False,
                is_sacrifice=False,
                is_forced=True,
                prev_eval=0.0,
                curr_eval=-5.0,
                second_best_gap=0.0,
            ),
            "forced",
        )



class AnalysisMetricTests(unittest.TestCase):
    def test_time_control_parses_increment(self):
        self.assertEqual(_parse_time_control("600+5"), (600.0, 5.0))
        self.assertEqual(_parse_time_control("300+0"), (300.0, 0.0))

    def test_time_control_parses_multi_stage_base(self):
        self.assertEqual(_parse_time_control("40/7200:3600"), (7200.0, 0.0))

    def test_time_control_missing_or_unusual_is_safe(self):
        self.assertEqual(_parse_time_control(""), (None, 0.0))
        self.assertEqual(_parse_time_control("unknown"), (None, 0.0))

    def test_expected_points_are_monotonic_and_symmetric(self):
        self.assertGreater(calc_expected_points(100), calc_expected_points(0))
        self.assertGreater(calc_expected_points(0), calc_expected_points(-100))
        self.assertAlmostEqual(
            calc_expected_points(100) + calc_expected_points(-100),
            1.0,
            places=8,
        )

    def test_phase_detection(self):
        self.assertEqual(_classify_game_phase(chess.Board()), "opening")
        kings_only = chess.Board("7k/8/8/8/8/8/8/K7 w - - 0 40")
        self.assertEqual(_classify_game_phase(kings_only), "endgame")



    def test_multipv_fallback_recovers_three_unique_lines(self):
        board = chess.Board()

        class FakeEngine:
            def __init__(self):
                self.calls = 0

            def analyse(self, position, limit, multipv=1, root_moves=None):
                self.calls += 1
                roots = list(root_moves) if root_moves is not None else list(position.legal_moves)
                infos = []
                for index, move in enumerate(roots):
                    score = chess.engine.PovScore(
                        chess.engine.Cp(200 - index * 25),
                        chess.WHITE,
                    )
                    infos.append({"pv": [move], "score": score})
                # Simulate an engine wrapper that ignores MultiPV on the first call.
                return infos[:1] if self.calls == 1 else infos[:multipv]

        engine = FakeEngine()
        infos = get_position_analysis(engine, board)

        self.assertEqual(len(infos), 3)
        self.assertEqual(len({info["pv"][0].uci() for info in infos}), 3)
        self.assertEqual(engine.calls, 2)

        lines = format_multipv_infos(board, infos)
        self.assertEqual(len(lines), 3)
        self.assertEqual(lines[0]["rank"], 1)
        self.assertEqual(lines[0]["uci"], infos[0]["pv"][0].uci())

    def test_expected_points_loss_is_non_negative_and_uses_player_pov(self):
        from services.game_analyzer import _calculate_loss_metrics

        before = chess.engine.PovScore(chess.engine.Cp(150), chess.WHITE)
        after = chess.engine.PovScore(chess.engine.Cp(50), chess.WHITE)
        loss, cp_loss, before_cp, after_cp = _calculate_loss_metrics(
            before,
            after,
            chess.WHITE,
        )
        self.assertGreater(loss, 0)
        self.assertEqual(cp_loss, 100)
        self.assertEqual(before_cp, 150)
        self.assertEqual(after_cp, 50)


if __name__ == "__main__":
    unittest.main()
