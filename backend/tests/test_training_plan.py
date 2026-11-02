"""Regression tests for the personalized weekly training schedule."""

import unittest
from datetime import date

from services.training_plan import build_personal_plan


class PersonalPlanVarietyTests(unittest.TestCase):
    def make_plan(self):
        return build_personal_plan(
            current_elo=900,
            target_elo=1200,
            goal_days=28,
            daily_minutes=60,
            start_on=date(2026, 1, 5),
        )["plan"]

    def test_weekly_templates_rotate_instead_of_repeating(self):
        plan = self.make_plan()
        first_week_monday = plan[0]["tasks"]
        second_week_monday = plan[7]["tasks"]

        self.assertNotEqual(
            [task["type"] for task in first_week_monday],
            [task["type"] for task in second_week_monday],
        )
        self.assertNotEqual(
            [task["title"] for task in first_week_monday],
            [task["title"] for task in second_week_monday],
        )

    def test_learning_tasks_have_specific_focus(self):
        plan = self.make_plan()
        learning_tasks = [
            task
            for day in plan
            for task in day["tasks"]
            if task["type"] in {"tactics", "endgame", "opening", "strategy", "review", "game"}
        ]

        self.assertTrue(learning_tasks)
        self.assertTrue(all(task.get("focus") for task in learning_tasks))
        self.assertGreater(len({task["focus"] for task in learning_tasks}), 4)


if __name__ == "__main__":
    unittest.main()
