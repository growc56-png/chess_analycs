"""Tests for capability-aware Stockfish configuration."""
import unittest

from services.stockfish import configure_engine


class FakeEngine:
    def __init__(self, supported):
        self.options = {name: object() for name in supported}
        self.configured = None

    def configure(self, values):
        self.configured = dict(values)


class StockfishConfigurationTests(unittest.TestCase):
    def test_analysis_profile_uses_configured_threads_and_hash(self):
        from config import ENGINE_THREADS, ENGINE_HASH_MB

        engine = FakeEngine({"Threads", "Hash", "UCI_ShowWDL", "Move Overhead"})
        result = configure_engine(engine, profile="analysis")

        self.assertEqual(engine.configured["Threads"], ENGINE_THREADS)
        self.assertEqual(engine.configured["Hash"], ENGINE_HASH_MB)
        self.assertTrue(engine.configured["UCI_ShowWDL"])
        self.assertEqual(engine.configured["Move Overhead"], 20)
        self.assertEqual(result["profile"], "analysis")

    def test_bot_profile_uses_smaller_resource_budget(self):
        from config import BOT_ENGINE_THREADS, BOT_ENGINE_HASH_MB

        engine = FakeEngine({"Threads", "Hash", "UCI_ShowWDL", "Move Overhead"})
        result = configure_engine(engine, profile="bot")

        self.assertEqual(engine.configured["Threads"], BOT_ENGINE_THREADS)
        self.assertEqual(engine.configured["Hash"], BOT_ENGINE_HASH_MB)
        self.assertEqual(engine.configured["Move Overhead"], 30)
        self.assertEqual(result["profile"], "bot")

    def test_older_engine_only_receives_options_it_advertises(self):
        engine = FakeEngine({"Threads", "Hash"})
        configure_engine(engine, profile="analysis")
        self.assertEqual(set(engine.configured), {"Threads", "Hash"})

    def test_invalid_profile_falls_back_to_analysis_budget(self):
        from config import ENGINE_THREADS, ENGINE_HASH_MB

        engine = FakeEngine({"Threads", "Hash"})
        result = configure_engine(engine, profile="unexpected")
        self.assertEqual(engine.configured["Threads"], ENGINE_THREADS)
        self.assertEqual(engine.configured["Hash"], ENGINE_HASH_MB)
        self.assertEqual(result["profile"], "unexpected")


if __name__ == "__main__":
    unittest.main()
