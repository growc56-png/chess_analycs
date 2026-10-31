from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import date
import sqlite3
import os
import sys
import io
import math
import threading
import chess
import chess.pgn
import chess.engine

# --- ПРАВИЛЬНЫЕ ПУТИ ---
# --- ПУТИ К ФАЙЛАМ ПРОЕКТА ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = CURRENT_DIR  # main.py находится в корне проекта

FRONT_DIR = os.path.join(BASE_DIR, "front")
JS_DIR = os.path.join(BASE_DIR, "js")
CSS_DIR = os.path.join(BASE_DIR, "css")
IMG_DIR = os.path.join(BASE_DIR, "img")

DB_PATH = os.path.join(BASE_DIR, "chess_trainer.db")
STOCKFISH_PATH = os.path.join(
    BASE_DIR,
    "stockfish-windows-x86-64-universal.exe"
)

sys.path.insert(0, CURRENT_DIR)
from bots import router as bots_router

for folder in [JS_DIR, CSS_DIR, IMG_DIR, FRONT_DIR]:
    os.makedirs(folder, exist_ok=True)

app = FastAPI(title="Chess Trainer")
engine_lock = threading.Lock() 

app.mount("/js", StaticFiles(directory=JS_DIR), name="js")
app.mount("/css", StaticFiles(directory=CSS_DIR), name="css")
app.mount("/img", StaticFiles(directory=IMG_DIR), name="img")
app.include_router(bots_router)

@app.get("/index.css")
def get_index_css(): return FileResponse(os.path.join(FRONT_DIR, "index.css"))

@app.get("/index.js")
def get_index_js(): return FileResponse(os.path.join(FRONT_DIR, "index.js"))

@app.get("/shared.js")
def get_shared_js(): return FileResponse(os.path.join(FRONT_DIR, "shared.js"))

@app.get("/bots.js")
def get_bots_js(): return FileResponse(os.path.join(FRONT_DIR, "bots.js"))

@app.get("/mates.js")
def get_mates_js(): return FileResponse(os.path.join(FRONT_DIR, "mates.js"))

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS completed (day_num INTEGER PRIMARY KEY, completed_at TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS notes (day_num INTEGER PRIMARY KEY, text TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS activity (day_date TEXT PRIMARY KEY)""")
    c.execute("""CREATE TABLE IF NOT EXISTS streak_results (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, result TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS mate_records (mate_id TEXT PRIMARY KEY, best_time REAL)""")
    conn.commit()
    conn.close()

init_db()

PHASES = [
    {"name": "Фаза 1: Основы и борьба со зевками", "weeks": (1, 2), "elo": "800–900", "tactics": "вилки, связки, двойные удары", "endgames": "мат королём и ладьей", "opening": "принципы: центр, развитие"},
    {"name": "Фаза 2: Тактика и базовые эндшпили", "weeks": (3, 6), "elo": "900–1050", "tactics": "отвлечение, завлечение, маты в 2", "endgames": "король + пешка, оппозиция", "opening": "1 дебют за белых, 2 за чёрных"},
    {"name": "Фаза 3: Дебют и стратегия", "weeks": (7, 10), "elo": "1050–1150", "tactics": "уничтожение защиты, комбинации", "endgames": "ладейные окончания", "opening": "репертуар 10–12 ходов"},
    {"name": "Фаза 4: Закрепление и комбинации", "weeks": (11, 16), "elo": "1150–1300", "tactics": "сложные комбинации, маты в 3", "endgames": "разноцветные слоны", "opening": "глубина 12–15 ходов"},
]

DAY_TEMPLATES = {
    0: ("Понедельник", ["tactics", "game", "review"]),
    1: ("Вторник",     ["tactics", "endgame"]),
    2: ("Среда",       ["opening", "game", "review"]),
    3: ("Четверг",     ["tactics", "strategy"]),
    4: ("Пятница",     ["endgame", "game", "review"]),
    5: ("Суббота",     ["tactics", "game", "review", "extra_game"]),
    6: ("Воскресенье", ["rest"]),
}

def build_tasks(tt, phase):
    if tt == "tactics": return [{"type": "tactics", "title": f"Тактика: {phase['tactics']}", "duration": "20–30 мин", "detail": "Решай медленно, записывай темы ошибок.", "link": "https://www.chess.com/puzzles"}]
    if tt == "endgame": return [{"type": "endgame", "title": f"Эндшпиль: {phase['endgames']}", "duration": "20 мин", "detail": "Отрабатывай позиции до автоматизма.", "link": "https://lichess.org/practice"}]
    if tt == "opening": return [{"type": "opening", "title": f"Дебют: {phase['opening']}", "duration": "15–20 мин", "detail": "Учи идеи, а не варианты.", "link": "https://www.chess.com/openings"}]
    if tt == "strategy": return [{"type": "strategy", "title": "Стратегия: принципы", "duration": "20 мин", "detail": "Открытые линии, слабые поля, форпосты.", "link": "https://www.chess.com/lessons"}]
    if tt == "game": return [{"type": "game", "title": "Рапид-партии (10+0)", "duration": "30–45 мин", "detail": "Перед каждым ходом использовать чек-лист. Стоп-лосс: 2 поражения подряд = конец игры.", "link": "https://www.chess.com/play/online", "checklist": ["1. Что изменил последний ход соперника?", "2. Какая у него угроза (мат, вилка, связка)?", "3. Какие у меня есть шахи и взятия?", "4. Есть ли у меня форсированный мат?", "5. Не зеваю ли я фигуру/мат своим ходом?"]}]
    if tt == "extra_game": return [{"type": "game", "title": "Доп: 1 партия", "duration": "20–30 мин", "detail": "Только если в форме. Не забывай про чек-лист ходов.", "link": "https://www.chess.com/play/online", "checklist": ["1. Что изменил последний ход соперника?", "2. Какая у него угроза?", "3. Не зеваю ли я фигуру/мат?"]}]
    if tt == "review": return [{"type": "review", "title": "Разбор партий", "duration": "10–15 мин", "detail": "Найди первую грубую ошибку.", "link": "https://www.chess.com/analysis"}]
    if tt == "rest": return [{"type": "rest", "title": "Отдых", "duration": "0–15 мин", "detail": "Дай голове восстановиться.", "link": None}]
    return []

def generate_plan():
    plan = []
    day_num = 1
    for phase in PHASES:
        for week in range(phase["weeks"][0], phase["weeks"][1] + 1):
            for weekday in range(7):
                dow_name, task_types = DAY_TEMPLATES[weekday]
                tasks = []
                for tt in task_types: tasks.extend(build_tasks(tt, phase))
                plan.append({"day": day_num, "week": week, "weekday": dow_name, "phase": phase["name"], "target_elo": phase["elo"], "tasks": tasks})
                day_num += 1
    return plan

PLAN = generate_plan()

PUZZLES = [
    {"id": 1, "title": "Мат в 1: Ладья", "fen": "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", "solution": "a1a8", "hint": "Ладья по последней горизонтали."},
    {"id": 2, "title": "Мат в 1: Ферзь", "fen": "6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1", "solution": "d1d8", "hint": "Ферзь по открытой линии."},
    {"id": 3, "title": "Мат в 1: Детский мат", "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1", "solution": "h5f7", "hint": "Ферзь + слон на f7."},
    {"id": 4, "title": "Мат в 1: Взятие с матом", "fen": "4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", "solution": "e1e8", "hint": "Бей фигуру соперника."},
]

ENDGAMES = [
    {"id": 1, "title": "Король и пешка (Оппозиция)", "fen": "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1", "hint": "Задача: провести пешку в ферзи. Займи оппозицию королем."},
    {"id": 2, "title": "Мат ладьёй и королём", "fen": "8/8/8/4k3/8/8/6K1/7R w - - 0 1", "hint": "Отрезай короля по горизонтали, подводи своего."},
    {"id": 3, "title": "Мат ферзём и королём", "fen": "8/8/8/4k3/8/8/6K1/7Q w - - 0 1", "hint": "Сжимай кольцо ферзем, не ставь пат."},
    {"id": 4, "title": "Позиция Лусены (Ладья+Пешка)", "fen": "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1", "hint": "Построй мост ладьей на 4-ю горизонталь."},
    {"id": 5, "title": "Позиция Филидора (Защита)", "fen": "8/8/8/4k3/4r3/8/4K3/4R3 b - - 0 1", "hint": "Держи ладью на 3-й горизонтали, чтобы не пропустить короля."}
]

OPENINGS = [
    {"id": "london_main", "side": "white", "family": "Лондонская система", "name": "Основная линия", "moves": ["d4", "d5", "Bf4", "Nf6", "e3", "e6", "Nf3", "c5", "c3", "Nc6"], "description": "Классический Лондон. Слон на f4 выводится до хода e3, чтобы не запирать его.", "plans_white": "Контроль над e5, развитие Nbd2 и атака на королевском фланге.", "plans_black": "Развитие Nc6 и Bd6, подрыв пешки d4 ходом c5."},
    {"id": "london_kid", "side": "white", "family": "Лондонская система", "name": "Против КИД", "moves": ["d4", "Nf6", "Bf4", "g6", "Nf3", "Bg7", "e3", "O-O", "Be2", "d6"], "description": "Лондон против Староиндийской защиты. Белые строят надежную крепость.", "plans_white": "Рокировка, давление на ферзевом фланге.", "plans_black": "Атака на королевском фланге, ход e5."},
    {"id": "birds_main", "side": "white", "family": "Дебют Берда", "name": "Классический вариант", "moves": ["f4", "d5", "Nf3", "g6", "e3", "Bg7", "Be2", "Nf6", "O-O", "O-O"], "description": "Дебют Берда — нестандартный, но опасный дебют. Белые контролируют e5.", "plans_white": "Атака на королевском фланге, ход f5.", "plans_black": "Давление в центре, ход c5."},
    {"id": "italian_giuoco", "side": "white", "family": "Итальянская партия", "name": "Giuoco Piano (Тихий вариант)", "moves": ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6"], "description": "Один из старейших дебютов. Белые готовят медленное наступление.", "plans_white": "Подготовка d4, развитие фигур.", "plans_black": "Симметричное развитие, контроль над d4."},
    {"id": "italian_evans", "side": "white", "family": "Итальянская партия", "name": "Гамбит Эванса", "moves": ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "b4", "Bxb4", "c3", "Ba5"], "description": "Жертва пешки за быстрый захват центра и атаку.", "plans_white": "Захват центра ходом d4, атака на короля.", "plans_black": "Удержание пешки, точная защита."},
    {"id": "italian_two_knights", "side": "white", "family": "Итальянская партия", "name": "Защита двух коней", "moves": ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Na5"], "description": "Острый вариант, где белые атакуют f7, а чёрные получают контригру.", "plans_white": "Атака на f7, быстрое развитие.", "plans_black": "Контригра на ферзевом фланге, используя коня на a5."},
    {"id": "ruy_morphy", "side": "white", "family": "Испанская партия", "name": "Защита Морфи", "moves": ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"], "description": "Самая популярная линия Испанской партии. Слон уходит на a4.", "plans_white": "Давление на e5, подготовка d4.", "plans_black": "Атака на e4 ходом b5."},
    {"id": "ruy_berlin", "side": "white", "family": "Испанская партия", "name": "Берлинская защита", "moves": ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6", "O-O", "Nxe4", "d4", "Nd6"], "description": "Берлинская стена — надёжная защита, часто ведущая к эндшпилю.", "plans_white": "Использовать перевес в пространстве, атаковать на королевском фланге.", "plans_black": "Прочная позиция, размен фигур, игра в эндшпиле."},
    {"id": "ruy_closed", "side": "white", "family": "Испанская партия", "name": "Закрытый вариант", "moves": ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O"], "description": "Классический закрытый вариант Испанской партии. Белые долго маневрируют.", "plans_white": "Подготовка d4, игра на ферзевом фланге.", "plans_black": "Освобождение ходом d5 или c5."},
    {"id": "qgd_main", "side": "white", "family": "Ферзевый гамбит", "name": "Отказанный (QGD)", "moves": ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O"], "description": "Классический QGD. Борьба идет за поле e4 и линию c.", "plans_white": "Игра на ферзевом фланге, ход cxd5.", "plans_black": "Свободное развитие, подрыв c5."},
    {"id": "qga_main", "side": "white", "family": "Ферзевый гамбит", "name": "Принятый (QGA)", "moves": ["d4", "d5", "c4", "dxc4", "Nf3", "Nf6", "e3", "e6", "Bxc4", "c5"], "description": "Принятый ферзевый гамбит. Белые возвращают пешку и получают центр.", "plans_white": "Захват центра, развитие фигур.", "plans_black": "Активная игра на ферзевом фланге."},
    {"id": "catalan", "side": "white", "family": "Каталонское начало", "name": "Закрытый вариант", "moves": ["d4", "Nf6", "c4", "e6", "g3", "d5", "Bg2", "Be7", "Nf3", "O-O"], "description": "Слон на g2 оказывает мощное давление по длинной диагонали.", "plans_white": "Давление на d5, игра в центре.", "plans_black": "Освобождение ходом dxc4 или c5."},
    {"id": "catalan_open", "side": "white", "family": "Каталонское начало", "name": "Открытый вариант", "moves": ["d4", "Nf6", "c4", "e6", "g3", "d5", "Bg2", "dxc4", "Nf3", "a6"], "description": "Открытый Каталон — чёрные берут на c4, белые получают сильный центр.", "plans_white": "Захват центра, давление на ферзевом фланге.", "plans_black": "Удержание пешки c4, развитие."},
    {"id": "english_sym", "side": "white", "family": "Английское начало", "name": "Симметричный вариант", "moves": ["c4", "c5", "Nf3", "Nf6", "Nc3", "Nc6", "g3", "g6", "Bg2", "Bg7"], "description": "Английское начало — гибкий дебют, часто переходящий в другие системы.", "plans_white": "Контроль над d5, фианкетто.", "plans_black": "Симметричная игра, давление на d4."},
    {"id": "reti_main", "side": "white", "family": "Дебют Рети", "name": "Основная линия", "moves": ["Nf3", "d5", "c4", "e6", "g3", "Nf6", "Bg2", "Be7", "O-O", "O-O"], "description": "Дебют Рети — современный подход, контроль над центром с флангов.", "plans_white": "Давление на d5, игра на ферзевом фланге.", "plans_black": "Захват центра, развитие."},
    {"id": "vienna_main", "side": "white", "family": "Венская партия", "name": "Основная линия", "moves": ["e4", "e5", "Nc3", "Nf6", "f4", "d5", "fxe5", "Nxe4", "Nf3", "Be7"], "description": "Венская партия — агрессивный дебют с идеей f4.", "plans_white": "Атака на королевском фланге, использование пешки f4.", "plans_black": "Контригра в центре, развитие."},
    {"id": "scotch_main", "side": "white", "family": "Шотландская партия", "name": "Классический вариант", "moves": ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4", "Bc5", "Be3", "Qf6"], "description": "Шотландская партия — открытая игра с быстрым развитием.", "plans_white": "Активное развитие, атака на короля.", "plans_black": "Давление на d4, развитие фигур."},
    {"id": "kings_gambit", "side": "white", "family": "Королевский гамбит", "name": "Принятый", "moves": ["e4", "e5", "f4", "exf4", "Nf3", "d5", "exd5", "Nf6", "Bc4", "Nxd5"], "description": "Королевский гамбит — романтический и острый дебют.", "plans_white": "Атака на королевском фланге, быстрый захват центра.", "plans_black": "Удержание пешки f4, контригра в центре."},
    {"id": "sicilian_najdorf", "side": "black", "family": "Сицилианская защита", "name": "Найдорф", "moves": ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"], "description": "Самая агрессивная и популярная защита на 1.e4.", "plans_white": "Атака на королевском фланге (Bg5, f4).", "plans_black": "Контригра на ферзевом (b5, Bb7)."},
    {"id": "sicilian_dragon", "side": "black", "family": "Сицилианская защита", "name": "Дракон", "moves": ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6"], "description": "Слон на g7 простреливает всю доску. Очень острый вариант.", "plans_white": "Рокировка в длинную сторону, пешечный штурм h4-h5.", "plans_black": "Атака на ферзевом фланге, давление по диагонали a1-h8."},
    {"id": "sicilian_alapin", "side": "black", "family": "Сицилианская защита", "name": "Против варианта Алапина", "moves": ["e4", "c5", "c3", "Nf6", "e5", "Nd5", "d4", "cxd4", "Nf3", "Nc6"], "description": "Белые играют c3, отказываясь от открытой сицилианки.", "plans_white": "Захват центра, атака на Nd5.", "plans_black": "Давление на пешку e5, фианкетто."},
    {"id": "sicilian_classical", "side": "black", "family": "Сицилианская защита", "name": "Классический вариант", "moves": ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "Nc6"], "description": "Классическая сицилианка — надёжный и популярный вариант.", "plans_white": "Атака на королевском фланге, развитие.", "plans_black": "Давление на d4, развитие фигур."},
    {"id": "sicilian_scheveningen", "side": "black", "family": "Сицилианская защита", "name": "Схевенинген", "moves": ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6", "Be3", "e6"], "description": "Гибкая схема с e6 и a6, популярная на высоком уровне.", "plans_white": "Атака на королевском фланге, f4.", "plans_black": "Контригра на ферзевом фланге, b5."},
    {"id": "sicilian_sveshnikov", "side": "black", "family": "Сицилианская защита", "name": "Свешников", "moves": ["e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "e5"], "description": "Свешников — активная защита с ходом e5.", "plans_white": "Использование слабости d5, давление.", "plans_black": "Активная игра фигурами, контроль над d4."},
    {"id": "french_winawer", "side": "black", "family": "Французская защита", "name": "Винавер", "moves": ["e4", "e6", "d4", "d5", "Nc3", "Bb4", "e5", "c5", "a3", "Bxc3+"], "description": "Самый острый вариант Французской защиты.", "plans_white": "Атака на королевском фланге, игра с разбитыми пешками.", "plans_black": "Давление на ферзевом фланге, пешка c5."},
    {"id": "french_classical", "side": "black", "family": "Французская защита", "name": "Классический вариант", "moves": ["e4", "e6", "d4", "d5", "Nc3", "Nf6", "e5", "Nfd7", "f4", "c5"], "description": "Классическая французская защита с ходом Nf6.", "plans_white": "Атака на королевском фланге, f4.", "plans_black": "Подрыв центра ходом c5."},
    {"id": "french_tarrasch", "side": "black", "family": "Французская защита", "name": "Тарраш", "moves": ["e4", "e6", "d4", "d5", "Nd2", "Nf6", "e5", "Nfd7", "Bd3", "c5"], "description": "Вариант Тарраша — популярный ответ на французскую защиту.", "plans_white": "Игра в центре, развитие.", "plans_black": "Давление на d4, контригра."},
    {"id": "caro_kann", "side": "black", "family": "Защита Каро-Канн", "name": "Классический вариант", "moves": ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5", "Ng3", "Bg6"], "description": "Очень прочная защита. Слон выводится до хода e6.", "plans_white": "Игра в центре, ход h4.", "plans_black": "Развитие и подрыв e5."},
    {"id": "caro_kann_advance", "side": "black", "family": "Защита Каро-Канн", "name": "Продвинутый вариант", "moves": ["e4", "c6", "d4", "d5", "e5", "Bf5", "Nf3", "e6", "Be2", "c5"], "description": "Продвинутый вариант Каро-Канн — активная игра в центре.", "plans_white": "Использование пространства, атака на королевском фланге.", "plans_black": "Подрыв центра ходом c5."},
    {"id": "caro_kann_exchange", "side": "black", "family": "Защита Каро-Канн", "name": "Разменный вариант", "moves": ["e4", "c6", "d4", "d5", "exd5", "cxd5", "Bd3", "Nc6", "c3", "Nf6"], "description": "Разменный вариант — симметричная и надёжная игра.", "plans_white": "Развитие, давление на d5.", "plans_black": "Активное развитие, контроль над центром."},
    {"id": "kid_classical", "side": "black", "family": "Староиндийская защита", "name": "Классическая система", "moves": ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O"], "description": "Черные позволяют белым захватить центр, чтобы затем его разрушить.", "plans_white": "Наступление в центре (e5), игра на ферзевом.", "plans_black": "Атака на королевском фланге (f5, e5)."},
    {"id": "kid_samisch", "side": "black", "family": "Староиндийская защита", "name": "Система Земиша", "moves": ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "f3", "O-O"], "description": "Система Земиша — агрессивная схема с f3.", "plans_white": "Атака на королевском фланге, длинная рокировка.", "plans_black": "Контригра в центре, подрыв e5 или c5."},
    {"id": "nimzo_classical", "side": "black", "family": "Нимцович-Индийская защита", "name": "Классический вариант", "moves": ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4", "Qc2", "O-O", "a3", "Bxc3+"], "description": "Классический Нимцович — борьба за контроль над центром.", "plans_white": "Использование двух слонов, игра в центре.", "plans_black": "Давление на c3 и e4, развитие."},
    {"id": "qid_classical", "side": "black", "family": "Новоиндийская защита", "name": "Классический вариант", "moves": ["d4", "Nf6", "c4", "e6", "Nf3", "b6", "g3", "Bb7", "Bg2", "Be7"], "description": "Новоиндийская защита — гибкая схема с фианкетто.", "plans_white": "Контроль над центром, давление на d5.", "plans_black": "Давление на e4 и d4, развитие."},
    {"id": "slav_defense", "side": "black", "family": "Славянская защита", "name": "Основная линия", "moves": ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "dxc4", "a4", "Bf5"], "description": "Славянская защита — надежный ответ на 1.d4.", "plans_white": "Возврат пешки, давление на c4.", "plans_black": "Удержание пешки c4, развитие слона."},
    {"id": "semi_slav", "side": "black", "family": "Славянская защита", "name": "Полуславянская защита", "moves": ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "e6", "e3", "Nbd7"], "description": "Полуславянская — комбинация славянской и французской идей.", "plans_white": "Захват центра, атака на королевском фланге.", "plans_black": "Подрыв центра ходом c5 или e5."},
    {"id": "grunfeld_exchange", "side": "black", "family": "Защита Грюнфельда", "name": "Разменный вариант", "moves": ["d4", "Nf6", "c4", "g6", "Nc3", "d5", "cxd5", "Nxd5", "e4", "Nxc3"], "description": "Разменный вариант Грюнфельда — популярная и острая линия.", "plans_white": "Захват центра, использование пешечного перевеса.", "plans_black": "Давление на центр, активные фигуры."},
    {"id": "pirc_defense", "side": "black", "family": "Защита Пирца", "name": "Классическая система", "moves": ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Nf3", "Bg7", "Be2", "O-O"], "description": "Защита Пирца — гибкая и провокационная схема.", "plans_white": "Захват центра, атака на королевском фланге.", "plans_black": "Подрыв центра ходом e5 или c5."},
    {"id": "modern_defense", "side": "black", "family": "Современная защита", "name": "Основная линия", "moves": ["e4", "g6", "d4", "Bg7", "Nc3", "d6", "f4", "Nf6", "Nf3", "O-O"], "description": "Современная защита — универсальная схема с фианкетто.", "plans_white": "Атака на королевском фланге, использование пространства.", "plans_black": "Контригра на ферзевом фланге, подрыв центра."},
    {"id": "alekhine_defense", "side": "black", "family": "Защита Алехина", "name": "Современная линия", "moves": ["e4", "Nf6", "e5", "Nd5", "d4", "d6", "Nf3", "dxe5", "Nxe5", "c6"], "description": "Защита Алехина — провокационная и нестандартная.", "plans_white": "Захват пространства, атака на коня.", "plans_black": "Подрыв центра, активная игра фигурами."},
    {"id": "scandinavian_defense", "side": "black", "family": "Скандинавская защита", "name": "Основная линия", "moves": ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "d4", "Nf6", "Nf3", "c6"], "description": "Скандинавская защита — прямой и агрессивный ответ на 1.e4.", "plans_white": "Быстрое развитие, атака на ферзя.", "plans_black": "Активная игра ферзём, развитие."},
    {"id": "dutch_defense", "side": "black", "family": "Голландская защита", "name": "Классический вариант", "moves": ["d4", "f5", "g3", "Nf6", "Bg2", "e6", "Nf3", "Be7", "O-O", "O-O"], "description": "Голландская защита — агрессивная схема с ходом f5.", "plans_white": "Игра в центре, использование слабости e6.", "plans_black": "Атака на королевском фланге, давление на e4."},
]

POPULAR_OPENINGS = [["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"], ["e4", "e5", "Nf3", "Nc6", "Bb5"], ["e4", "e5", "Nf3", "Nc6", "d4"], ["e4", "c5", "Nf3", "d6"]] + [o["moves"] for o in OPENINGS]

def is_book_move(history_san):
    for line in POPULAR_OPENINGS:
        if len(history_san) <= len(line):
            if history_san == line[:len(history_san)]:
                return True
    return False

RECOMMENDATION_RULES = {"вилк": "Отработка тактики", "связк": "Тренировка связок", "мат": "Матовые сети", "зев": "Концентрация"}

class CompleteBody(BaseModel):
    day: int
    completed: bool

class NoteBody(BaseModel):
    day: int
    text: str

class AnalyzeBody(BaseModel):
    pgn: str

class EvaluateBody(BaseModel):
    fen: str

class ActivityBody(BaseModel):
    day_date: str

class StreakBody(BaseModel):
    result: str

class MateRecordBody(BaseModel):
    mate_id: str
    time: float

@app.get("/api/plan")
def get_plan():
    conn = sqlite3.connect(DB_PATH); cur = conn.cursor()
    cur.execute("SELECT day_num FROM completed"); done = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT day_num, text FROM notes"); notes = {r[0]: r[1] for r in cur.fetchall()}
    conn.close()
    result = []
    for d in PLAN:
        item = dict(d); item["completed"] = d["day"] in done; item["note"] = notes.get(d["day"], "")
        result.append(item)
    return {"plan": result, "total_days": len(PLAN), "completed_days": len(done)}

@app.get("/api/recommendations")
def get_recommendations():
    conn = sqlite3.connect(DB_PATH); cur = conn.cursor()
    cur.execute("SELECT text FROM notes WHERE text IS NOT NULL AND text != ''")
    notes = [r[0].lower() for r in cur.fetchall()]; conn.close()
    found_themes = set()
    for note in notes:
        for keyword, theme in RECOMMENDATION_RULES.items():
            if keyword in note: found_themes.add(theme)
    return {"recommendations": list(found_themes)}

@app.post("/api/complete")
def complete_day(body: CompleteBody):
    conn = sqlite3.connect(DB_PATH)
    if body.completed: conn.execute("INSERT OR REPLACE INTO completed (day_num, completed_at) VALUES (?, ?)", (body.day, date.today().isoformat()))
    else: conn.execute("DELETE FROM completed WHERE day_num=?", (body.day,))
    conn.commit(); conn.close(); return {"ok": True}

@app.post("/api/note")
def save_note(body: NoteBody):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("INSERT OR REPLACE INTO notes (day_num, text) VALUES (?, ?)", (body.day, body.text))
    conn.commit(); conn.close(); return {"ok": True}

@app.get("/api/puzzles")
def get_puzzles(): return {"puzzles": PUZZLES}

@app.get("/api/endgames")
def get_endgames(): return {"endgames": ENDGAMES}

@app.get("/api/openings")
def get_openings(): return {"openings": OPENINGS}

@app.get("/api/diary")
def get_diary():
    conn = sqlite3.connect(DB_PATH); cur = conn.cursor()
    cur.execute("SELECT day_date FROM activity ORDER BY day_date ASC")
    dates = [r[0] for r in cur.fetchall()]; conn.close()
    return {"activity": dates}

@app.post("/api/diary")
def mark_diary(body: ActivityBody):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("INSERT OR IGNORE INTO activity (day_date) VALUES (?)", (body.day_date,))
    conn.commit(); conn.close(); return {"ok": True}

@app.get("/api/streak")
def get_streak():
    today = date.today().isoformat()
    conn = sqlite3.connect(DB_PATH); cur = conn.cursor()
    cur.execute("SELECT result FROM streak_results WHERE date = ? ORDER BY id ASC", (today,))
    results = [r[0] for r in cur.fetchall()]; conn.close()
    wins, losses, draws = results.count("win"), results.count("loss"), results.count("draw")
    current_streak, max_streak = 0, 0
    for r in results:
        if r == "win":
            current_streak += 1
            if current_streak > max_streak: max_streak = current_streak
        else: current_streak = 0
    return {"wins": wins, "losses": losses, "draws": draws, "current_streak": current_streak, "max_streak": max_streak}

@app.post("/api/streak")
def add_streak_result(body: StreakBody):
    today = date.today().isoformat()
    conn = sqlite3.connect(DB_PATH)
    conn.execute("INSERT INTO streak_results (date, result) VALUES (?, ?)", (today, body.result))
    conn.commit(); conn.close(); return {"ok": True}

@app.get("/api/mates/records")
def get_mate_records():
    conn = sqlite3.connect(DB_PATH); cur = conn.cursor()
    cur.execute("SELECT mate_id, best_time FROM mate_records")
    records = {r[0]: r[1] for r in cur.fetchall()}; conn.close()
    return {"records": records}

@app.post("/api/mates/records")
def save_mate_record(body: MateRecordBody):
    conn = sqlite3.connect(DB_PATH); cur = conn.cursor()
    cur.execute("SELECT best_time FROM mate_records WHERE mate_id = ?", (body.mate_id,))
    row = cur.fetchone()
    if not row or body.time < row[0]:
        conn.execute("INSERT OR REPLACE INTO mate_records (mate_id, best_time) VALUES (?, ?)", (body.mate_id, body.time))
    conn.commit(); conn.close(); return {"ok": True}

PIECE_VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}

def is_true_sacrifice(board_before, move):
    piece = board_before.piece_at(move.from_square)
    if not piece: return False
    piece_val = PIECE_VALUES.get(piece.piece_type, 0)
    captured = board_before.piece_at(move.to_square)
    captured_val = PIECE_VALUES.get(captured.piece_type, 0) if captured else 0
    if captured_val >= piece_val: return False
    board_after = board_before.copy(); board_after.push(move)
    to_sq = move.to_square
    if not board_after.is_attacked_by(not board_after.turn, to_sq): return False
    attackers = board_after.attackers(not board_after.turn, to_sq)
    defenders = board_after.attackers(board_after.turn, to_sq)
    if len(defenders) >= len(attackers): return False
    return True

def format_pv(board, pv):
    temp_board = board.copy(); res = []
    for m in pv[:8]:
        try: res.append(temp_board.san(m)); temp_board.push(m)
        except: break
    return " ".join(res)

def parse_score(score_obj):
    if score_obj is None: return {"eval": 0, "is_mate": False, "mate_in": 0}
    if score_obj.is_mate():
        mate_in = score_obj.mate()
        return {"eval": 100 if mate_in > 0 else -100, "is_mate": True, "mate_in": mate_in}
    else:
        val = score_obj.score()
        if val is None: val = 0
        return {"eval": round(val / 100.0, 2), "is_mate": False, "mate_in": 0}

def get_multipv_lines(engine, board, depth=10):
    infos = engine.analyse(board, chess.engine.Limit(depth=depth, time=1.5), multipv=3)
    lines = []
    for info in infos:
        if "pv" in info and info["pv"]:
            score = info.get("score")
            if score is None: continue
            pv_san = format_pv(board, info["pv"]); pv_score = parse_score(score.white())
            lines.append({"san": board.san(info["pv"][0]), "uci": info["pv"][0].uci(), "pv": pv_san, "eval": pv_score["eval"], "is_mate": pv_score["is_mate"], "mate_in": pv_score["mate_in"]})
    return lines

def calc_expected_points(eval_cp):
    if eval_cp > 1000: return 1.0
    if eval_cp < -1000: return 0.0
    return 1 / (1 + math.exp(-0.004 * eval_cp))

def classify_move(wpl, is_best, is_sac, is_forced, prev_eval, curr_eval, second_best_wpl):
    if is_forced: return "forced"
    if prev_eval > 200 and curr_eval < 50: return "miss"
    if is_best and is_sac and wpl <= 0.02 and prev_eval < 400: return "brilliant"
    if is_best and wpl <= 0.02 and second_best_wpl > 0.18: return "great"
    if wpl == 0.0: return "best"
    elif wpl <= 0.02: return "excellent"
    elif wpl <= 0.05: return "good"
    elif wpl <= 0.10: return "inaccuracy"
    elif wpl <= 0.20: return "mistake"
    else: return "blunder"

@app.post("/api/analyze")
def analyze_game(body: AnalyzeBody):
    with engine_lock:
        engine = None
        try:
            game = chess.pgn.read_game(io.StringIO(body.pgn))
            if not game: raise HTTPException(status_code=400, detail="Не удалось прочитать PGN")
            white_player = game.headers.get("White", "White"); black_player = game.headers.get("Black", "Black")
            board = game.board(); moves_data = []; history_san = []; evals = []
            if not os.path.exists(STOCKFISH_PATH): raise HTTPException(status_code=500, detail="Stockfish не найден")
            try: engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
            except Exception as e: raise HTTPException(status_code=500, detail=f"Ошибка Stockfish: {e}")
            
            prev_info = engine.analyse(board, chess.engine.Limit(depth=10, time=1.0), multipv=2)
            prev_score = prev_info[0].get("score")
            prev_parsed = parse_score(prev_score.white() if prev_score else None)
            prev_eval = prev_parsed["eval"]
            best_move_uci = prev_info[0]["pv"][0].uci() if "pv" in prev_info[0] and prev_info[0]["pv"] else None

            node = game
            for i, move in enumerate(game.mainline_moves()):
                node = node.next() if node else None
                san_move = board.san(move); history_san.append(san_move)
                is_book = is_book_move(history_san); is_best = (best_move_uci == move.uci())
                is_forced = board.legal_moves.count() == 1; is_sac = is_true_sacrifice(board, move)
                
                clock_before = node.clock() if node else None
                board.push(move)
                clock_after = node.clock() if node else None
                time_spent = max(0, clock_before - clock_after) if clock_before is not None and clock_after is not None else None

                info_after = engine.analyse(board, chess.engine.Limit(depth=10, time=1.0), multipv=2)
                curr_score = info_after[0].get("score")
                curr_parsed = parse_score(curr_score.white() if curr_score else None)
                curr_eval = curr_parsed["eval"]
                
                ep_before = calc_expected_points(prev_eval * 100); ep_after = calc_expected_points(curr_eval * 100)
                wpl = max(0, ep_before - ep_after)
                second_best_wpl = 0.0
                if len(info_after) > 1:
                    second_score = info_after[1].get("score")
                    if second_score:
                        second_best_parsed = parse_score(second_score.white()); second_best_eval = second_best_parsed["eval"]
                        ep_second_best = calc_expected_points(second_best_eval * 100); second_best_wpl = max(0, ep_after - ep_second_best)
                
                classification = "book" if is_book else classify_move(wpl, is_best, is_sac, is_forced, prev_eval, curr_eval, second_best_wpl)
                next_top_moves = get_multipv_lines(engine, board, depth=10)

                moves_data.append({"move_num": board.fullmove_number, "san": san_move, "eval": curr_eval, "uci": move.uci(), "is_mate": curr_parsed["is_mate"], "mate_in": curr_parsed["mate_in"], "cp_loss": int(wpl * 1000), "classification": classification, "fen": board.fen(), "next_top_moves": next_top_moves, "clock_after": clock_after, "time_spent": time_spent})
                graph_eval = max(-10, min(10, curr_eval)); evals.append(graph_eval)
                prev_eval = curr_eval; prev_parsed = curr_parsed
                best_move_uci = info_after[0]["pv"][0].uci() if "pv" in info_after[0] and info_after[0]["pv"] else None

            return {"moves": moves_data, "white_player": white_player, "black_player": black_player, "evals": evals}
        except Exception as e: raise HTTPException(status_code=500, detail=str(e))
        finally:
            if engine: engine.quit()

@app.post("/api/evaluate")
def evaluate_position(body: EvaluateBody):
    with engine_lock:
        engine = None
        try:
            board = chess.Board(body.fen)
            if not os.path.exists(STOCKFISH_PATH): raise HTTPException(status_code=500, detail="Stockfish не найден")
            engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
            top_moves = get_multipv_lines(engine, board, depth=10)
            score_obj = engine.analyse(board, chess.engine.Limit(depth=10, time=1.0)).get("score")
            score_dict = parse_score(score_obj.white() if score_obj else None)
            return {**score_dict, "top_moves": top_moves}
        except Exception as e: raise HTTPException(status_code=500, detail=str(e))
        finally:
            if engine: engine.quit()

@app.get("/", response_class=HTMLResponse)
def index():
    with open(os.path.join(FRONT_DIR, "index.html"), "r", encoding="utf-8") as f: return f.read()

@app.get("/bots", response_class=HTMLResponse)
def bots_page():
    with open(os.path.join(FRONT_DIR, "bots.html"), "r", encoding="utf-8") as f: return f.read()

@app.get("/mates", response_class=HTMLResponse)
def mates_page():
    with open(os.path.join(FRONT_DIR, "mates.html"), "r", encoding="utf-8") as f: return f.read()