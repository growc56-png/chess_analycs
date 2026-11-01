
PHASES = [
    {
        "name": "Фаза 1: Основы и борьба со зевками",
        "weeks": (1, 2),
        "elo": "800–900",
        "tactics": "вилки, связки, двойные удары",
        "endgames": "мат королём и ладьей",
        "opening": "принципы: центр, развитие"
    },
    {
        "name": "Фаза 2: Тактика и базовые эндшпили",
        "weeks": (3, 6),
        "elo": "900–1050",
        "tactics": "отвлечение, завлечение, маты в 2",
        "endgames": "король + пешка, оппозиция",
        "opening": "1 дебют за белых, 2 за чёрных"
    },
    {
        "name": "Фаза 3: Дебют и стратегия",
        "weeks": (7, 10),
        "elo": "1050–1150",
        "tactics": "уничтожение защиты, комбинации",
        "endgames": "ладейные окончания",
        "opening": "репертуар 10–12 ходов"
    },
    {
        "name": "Фаза 4: Закрепление и комбинации",
        "weeks": (11, 16),
        "elo": "1150–1300",
        "tactics": "сложные комбинации, маты в 3",
        "endgames": "разноцветные слоны",
        "opening": "глубина 12–15 ходов"
    },
]


DAY_TEMPLATES = {
    0: ("Понедельник", ["tactics", "game", "review"]),
    1: ("Вторник", ["tactics", "endgame"]),
    2: ("Среда", ["opening", "game", "review"]),
    3: ("Четверг", ["tactics", "strategy"]),
    4: ("Пятница", ["endgame", "game", "review"]),
    5: ("Суббота", ["tactics", "game", "review", "extra_game"]),
    6: ("Воскресенье", ["rest"]),
}


def build_tasks(task_type, phase):
    if task_type == "tactics":
        return [{
            "type": "tactics",
            "title": f"Тактика: {phase['tactics']}",
            "duration": "20–30 мин",
            "detail": "Решай медленно, записывай темы ошибок.",
            "link": "https://www.chess.com/puzzles"
        }]

    if task_type == "endgame":
        return [{
            "type": "endgame",
            "title": f"Эндшпиль: {phase['endgames']}",
            "duration": "20 мин",
            "detail": "Отрабатывай позиции до автоматизма.",
            "link": "https://lichess.org/practice"
        }]

    if task_type == "opening":
        return [{
            "type": "opening",
            "title": f"Дебют: {phase['opening']}",
            "duration": "15–20 мин",
            "detail": "Учи идеи, а не варианты.",
            "link": "https://www.chess.com/openings"
        }]

    if task_type == "strategy":
        return [{
            "type": "strategy",
            "title": "Стратегия: принципы",
            "duration": "20 мин",
            "detail": "Открытые линии, слабые поля, форпосты.",
            "link": "https://www.chess.com/lessons"
        }]

    if task_type == "game":
        return [{
            "type": "game",
            "title": "Рапид-партии (10+0)",
            "duration": "30–45 мин",
            "detail": "Перед каждым ходом использовать чек-лист. Стоп-лосс: 2 поражения подряд = конец игры.",
            "link": "https://www.chess.com/play/online",
            "checklist": [
                "1. Что изменил последний ход соперника?",
                "2. Какая у него угроза (мат, вилка, связка)?",
                "3. Какие у меня есть шахи и взятия?",
                "4. Есть ли у меня форсированный мат?",
                "5. Не зеваю ли я фигуру/мат своим ходом?"
            ]
        }]

    if task_type == "extra_game":
        return [{
            "type": "game",
            "title": "Доп: 1 партия",
            "duration": "20–30 мин",
            "detail": "Только если в форме. Не забывай про чек-лист ходов.",
            "link": "https://www.chess.com/play/online",
            "checklist": [
                "1. Что изменил последний ход соперника?",
                "2. Какая у него угроза?",
                "3. Не зеваю ли я фигуру/мат?"
            ]
        }]

    if task_type == "review":
        return [{
            "type": "review",
            "title": "Разбор партий",
            "duration": "10–15 мин",
            "detail": "Найди первую грубую ошибку.",
            "link": "https://www.chess.com/analysis"
        }]

    if task_type == "rest":
        return [{
            "type": "rest",
            "title": "Отдых",
            "duration": "0–15 мин",
            "detail": "Дай голове восстановиться.",
            "link": None
        }]

    return []


def generate_plan():
    plan = []
    day_num = 1

    for phase in PHASES:
        for week in range(phase["weeks"][0], phase["weeks"][1] + 1):
            for weekday in range(7):
                dow_name, task_types = DAY_TEMPLATES[weekday]
                tasks = []

                for task_type in task_types:
                    tasks.extend(build_tasks(task_type, phase))

                plan.append({
                    "day": day_num,
                    "week": week,
                    "weekday": dow_name,
                    "phase": phase["name"],
                    "target_elo": phase["elo"],
                    "tasks": tasks
                })

                day_num += 1

    return plan


PLAN = generate_plan()


RECOMMENDATION_RULES = {
    "вилк": "Отработка тактики",
    "связк": "Тренировка связок",
    "мат": "Матовые сети",
    "зев": "Концентрация"
}
