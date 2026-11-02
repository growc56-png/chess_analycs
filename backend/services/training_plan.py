from datetime import date, timedelta


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


# ============================================================
# ПЕРСОНАЛЬНЫЙ ПЛАН ПО ЦЕЛИ ELO
# ============================================================

ELO_BANDS = [
    (800, 1000, 75),
    (1000, 1200, 120),
    (1200, 1500, 210),
    (1500, 1800, 330),
    (1800, 2000, 360),
]

ELO_TOPICS = [
    (800, 1000, {
        "name": "Основы и защита от зевков",
        "tactics": "вилки в один ход, двойные удары, незащищённые фигуры",
        "endgame": "король и пешка, квадрат пешки, оппозиция",
        "opening": "контроль центра, развитие фигур, безопасность короля",
        "strategy": "активность фигур и простые планы",
    }),
    (1000, 1200, {
        "name": "Тактическая внимательность",
        "tactics": "вилки, связки, вскрытые нападения и маты в 2",
        "endgame": "пешечные окончания и базовые ладейные позиции",
        "opening": "репертуар из простых систем и типовые планы",
        "strategy": "слабые пешки, открытые линии, улучшение худшей фигуры",
    }),
    (1200, 1500, {
        "name": "Расчёт вариантов и стратегия",
        "tactics": "расчёт комбинаций на 2–3 хода, отвлечение и завлечение",
        "endgame": "ладейные окончания, активный король, проходные пешки",
        "opening": "понимание типовых структур и ключевых ходов",
        "strategy": "пешечные структуры, хорошие и плохие фигуры",
    }),
    (1500, 1800, {
        "name": "Глубокий расчёт и позиционная игра",
        "tactics": "кандидатные ходы, промежуточные ходы, форсированные варианты",
        "endgame": "технические окончания и реализация небольшого перевеса",
        "opening": "углубление репертуара и работа с собственными партиями",
        "strategy": "профилактика, слабые поля и долгосрочные планы",
    }),
    (1800, 2000, {
        "name": "Точность и мастерство",
        "tactics": "длинные форсированные линии, защита и контратака",
        "endgame": "сложные ладейные и разноцветные слоновые окончания",
        "opening": "точная подготовка вариантов и разбор современных планов",
        "strategy": "динамическая оценка, профилактика и преобразование преимуществ",
    }),
]


def estimate_goal_days(current_elo: int, target_elo: int) -> int:
    """Ориентировочная оценка срока, не обещание результата."""
    if target_elo <= current_elo:
        return 0
    remaining = target_elo - current_elo
    total_days = 0
    cursor = current_elo
    for lower, upper, days_per_band in ELO_BANDS:
        if cursor >= upper or target_elo <= lower:
            continue
        segment_start = max(cursor, lower)
        segment_end = min(target_elo, upper)
        if segment_end > segment_start:
            total_days += days_per_band * (segment_end - segment_start) / (upper - lower)
            cursor = segment_end
        if cursor >= target_elo:
            break
    return max(7, int(round(total_days)))


def _elo_topics(elo: int) -> dict:
    for lower, upper, topics in ELO_TOPICS:
        if lower <= elo < upper:
            return topics
    return ELO_TOPICS[-1][2]


def _duration_label(minutes: int) -> str:
    if minutes <= 0:
        return "Отдых"
    if minutes < 60:
        return f"{minutes} мин"
    hours, remainder = divmod(minutes, 60)
    return f"{hours} ч" if not remainder else f"{hours} ч {remainder} мин"


def _make_personal_task(task_type: str, minutes: int, topics: dict) -> dict:
    minutes = max(5, int(minutes))
    base = {
        "tactics": {
            "title": f"Тактика: {topics['tactics']}",
            "detail": "Сначала ищи шахи, взятия и угрозы. Не двигай фигуру, пока не проверишь ответ соперника.",
            "link": "https://lichess.org/training",
        },
        "endgame": {
            "title": f"Эндшпиль: {topics['endgame']}",
            "detail": "Разыграй несколько позиций с обеих сторон и после каждой объясни себе ключевую идею.",
            "link": "https://lichess.org/practice",
        },
        "opening": {
            "title": f"Дебют: {topics['opening']}",
            "detail": "Повторяй идеи и типовые планы, а не пытайся заучить длинные варианты без понимания.",
            "link": None,
        },
        "strategy": {
            "title": f"Стратегия: {topics['strategy']}",
            "detail": "Перед ходом оцени слабости, активность фигур и план соперника.",
            "link": "https://lichess.org/study",
        },
        "game": {
            "title": "Рапид-партии с контролем 10+0 или 15+10",
            "detail": "Играй вдумчиво. Перед каждым ходом проверяй угрозы соперника и свои форсированные возможности.",
            "link": "https://lichess.org/",
        },
        "review": {
            "title": "Разбор собственных партий",
            "detail": "Сначала найди ошибки самостоятельно, затем сравни свои варианты с Stockfish и запиши одну главную причину ошибки.",
            "link": None,
        },
        "rest": {
            "title": "Восстановление",
            "detail": "Отдохни от рейтинговых партий. Можно спокойно повторить заметки и посмотреть одну поучительную позицию.",
            "link": None,
        },
    }
    item = dict(base.get(task_type, base["review"]))
    item.update({
        "type": task_type,
        "duration": _duration_label(minutes),
        "minutes": minutes,
    })
    if task_type == "game":
        game_count = max(1, min(5, minutes // 30))
        item["game_count"] = game_count
        item["title"] = f"Сыграй {game_count} рапид-парт." if game_count > 1 else "Сыграй одну рапид-партию"
        item["detail"] = (
            f"Сыграй {game_count} партий с контролем 10+0 или 15+10. "
            "Между партиями делай короткую паузу и не играй на автопилоте."
        )
    return item


def build_personal_plan(
    current_elo: int,
    target_elo: int,
    goal_days: int,
    daily_minutes: int,
    completed_days: set[int] | None = None,
    notes: dict[int, str] | None = None,
    start_on: date | None = None,
) -> dict:
    """Строит ежедневный план под выбранный рейтинг, срок и время."""
    completed_days = completed_days or set()
    notes = notes or {}
    start_date = start_on or date.today()
    expected_days = estimate_goal_days(current_elo, target_elo)
    ratio = (expected_days / max(1, goal_days)) if expected_days else 0
    recommended_minutes = 0 if target_elo <= current_elo else min(
        360,
        max(60, int(round((75 + max(0, ratio - 1) * 11) / 5) * 5)),
    )

    warning = None
    if target_elo > current_elo and goal_days < expected_days * 0.55:
        warning = (
            f"Цель очень амбициозная: ориентир для пути {current_elo} → {target_elo} Elo — "
            f"около {expected_days} дней регулярной работы. За {goal_days} дней рейтинг нельзя гарантировать. "
            "Даже интенсивные занятия не заменяют опыт и качество разбора партий."
        )
    elif target_elo > current_elo and daily_minutes < recommended_minutes:
        warning = (
            f"Для выбранного срока ориентир нагрузки — около {recommended_minutes} минут в день. "
            f"Ты указал {daily_minutes} минут. План подстроен под доступное время, но срок достижения цели может увеличиться."
        )

    week_templates = [
        (["tactics", "game", "review"], [25, 50, 25]),
        (["tactics", "endgame", "opening"], [40, 35, 25]),
        (["game", "review", "opening"], [50, 25, 25]),
        (["tactics", "game", "strategy"], [30, 45, 25]),
        (["endgame", "game", "review"], [25, 50, 25]),
        (["tactics", "game", "review"], [25, 50, 25]),
        (["rest"], [100]),
    ]

    plan = []
    weekday_names = [
        "Понедельник", "Вторник", "Среда", "Четверг",
        "Пятница", "Суббота", "Воскресенье",
    ]

    for day_num in range(1, goal_days + 1):
        elapsed_fraction = (day_num - 1) / max(1, goal_days - 1)
        training_elo = int(round(current_elo + (target_elo - current_elo) * elapsed_fraction))
        topics = _elo_topics(training_elo)
        phase = next(
            (f"Этап: {topics['name']} ({lower}–{upper} Elo)"
             for lower, upper, band_topics in ELO_TOPICS
             if band_topics is topics),
            "Персональная подготовка",
        )

        task_types, weights = week_templates[(day_num - 1) % 7]
        if task_types == ["rest"]:
            tasks = [_make_personal_task("rest", min(20, max(10, daily_minutes // 6)), topics)]
        else:
            tasks = []
            allocated = 0
            for index, (task_type, weight) in enumerate(zip(task_types, weights)):
                minutes = (
                    daily_minutes - allocated
                    if index == len(task_types) - 1
                    else max(10, int(round(daily_minutes * weight / 100 / 5) * 5))
                )
                allocated += minutes
                tasks.append(_make_personal_task(task_type, minutes, topics))

        target_checkpoint = min(target_elo, int(round(current_elo + (target_elo - current_elo) * day_num / goal_days)))
        date_value = start_date + timedelta(days=day_num - 1)
        plan.append({
            "day": day_num,
            "week": (day_num - 1) // 7 + 1,
            "weekday": weekday_names[date_value.weekday()],
            "date": date_value.isoformat(),
            "phase": phase,
            "target_elo": f"{training_elo} Elo (ориентир)",
            "target_checkpoint": target_checkpoint,
            "completed": day_num in completed_days,
            "note": notes.get(day_num, ""),
            "tasks": tasks,
        })

    return {
        "plan": plan,
        "total_days": len(plan),
        "completed_days": len(completed_days),
        "goal": {
            "current_elo": current_elo,
            "target_elo": target_elo,
            "goal_days": goal_days,
            "daily_minutes": daily_minutes,
            "recommended_minutes": recommended_minutes,
            "estimated_days": expected_days,
            "warning": warning,
            "start_date": start_date.isoformat(),
            "end_date": (start_date + timedelta(days=goal_days - 1)).isoformat(),
        },
    }


RECOMMENDATION_RULES = {
    "вилк": "Отработка тактики",
    "связк": "Тренировка связок",
    "мат": "Матовые сети",
    "зев": "Концентрация"
}
