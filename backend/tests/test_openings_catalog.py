"""Validate every local opening line against python-chess."""
import json
import unittest
from pathlib import Path

import chess


class OpeningCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parents[2]
        source = (root / "front" / "js" / "openings-data.js").read_text(encoding="utf-8")
        _, separator, payload = source.partition("=")
        if not separator:
            raise RuntimeError("CHESS_OPENINGS_DATA assignment is missing")
        payload = payload.rsplit(";", 1)[0].strip()
        cls.openings = json.loads(payload)

    def test_every_opening_line_contains_only_legal_san_moves(self):
        self.assertGreater(len(self.openings), 0)
        failures = []
        for opening in self.openings:
            board = chess.Board()
            for ply, san in enumerate(opening.get("moves", []), start=1):
                try:
                    move = board.parse_san(san)
                    board.push(move)
                except (ValueError, chess.InvalidMoveError, chess.IllegalMoveError, chess.AmbiguousMoveError) as error:
                    failures.append(
                        f"{opening.get('id')} ply {ply} ({san}): {error}"
                    )
                    break
        self.assertEqual(failures, [], "Некорректные линии дебютов:\n" + "\n".join(failures))

    def test_opening_ids_are_unique_and_lines_are_long_enough(self):
        ids = [opening.get("id") for opening in self.openings]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(len(opening.get("moves", [])) >= 10 for opening in self.openings))


if __name__ == "__main__":
    unittest.main()
