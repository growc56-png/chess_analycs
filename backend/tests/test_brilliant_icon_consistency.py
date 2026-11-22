"""Regression guard for the Brilliant icon shared across analysis UI."""
import re
import unittest
from pathlib import Path


INDEX_JS = Path(__file__).resolve().parents[2] / "front" / "js" / "index.js"


class BrilliantIconConsistencyTests(unittest.TestCase):
    def test_board_move_list_and_statistics_use_the_same_diamond(self):
        source = INDEX_JS.read_text(encoding="utf-8")
        board_marker = re.search(
            r"brilliant:\s*\{\s*text:\s*'([^']+)'", source
        )
        shared_marker = re.search(
            r"\{\s*key:\s*'brilliant',\s*label:\s*'[^']*',\s*icon:\s*'([^']+)'", source
        )
        self.assertIsNotNone(board_marker)
        self.assertIsNotNone(shared_marker)
        self.assertEqual(board_marker.group(1), "💎")
        self.assertEqual(shared_marker.group(1), "💎")

        stats_start = source.index("function renderAnalysisSummary")
        stats_end = source.index("function updateAnalysisProgress", stats_start)
        move_list_start = source.index("function renderMoveTable")
        move_list_end = source.index("function getAnalysisTrainingOpportunities", move_list_start)
        variation_start = source.index("function renderAnalysisVariationMoves")
        variation_end = source.index("function updateAnalysisVariationUIStateOnly", variation_start)
        self.assertIn("row.icon", source[stats_start:stats_end])
        self.assertIn("meta.icon", source[move_list_start:move_list_end])
        self.assertIn("meta.icon", source[variation_start:variation_end])


if __name__ == "__main__":
    unittest.main()
