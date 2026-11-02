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


if __name__ == "__main__":
    unittest.main()
