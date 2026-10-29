from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import date
import sqlite3
import os
import io
import math
import chess
import chess.pgn
import chess.engine

DB_PATH = "chess_trainer.db"
app = FastAPI(title="Chess Trainer")

# ==========================================
# УКАЖИ ЗДЕСЬ ПУТЬ К СКАЧАННОМУ ФАЙЛУ STOCKFISH
# ==========================================
STOCKFISH_PATH = "./stockfish-windows-x86-64-universal.exe"

for folder in ["js", "css", "img"]:
    os.makedirs(folder, exist_ok=True)

app.mount("/js", StaticFiles(directory="js"), name="js")
app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/img", StaticFiles(directory="img"), name="img")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS completed (day_num INTEGER PRIMARY KEY, completed_at TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS notes (day_num INTEGER PRIMARY KEY, text TEXT)""")
    conn.commit()
    conn.close()

init_db()

# ============ ПЛАН ============
PHASES = [
    {"name": "Фаза 1: Основы и борьба со зевками", "weeks": (1, 2), "elo": "800–900", "tactics": "вилки, связки, двойные удары", "endgames": "мат королём и ладьёй", "opening": "принципы: центр, развитие"},
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

# ============ ЗАДАЧИ ============
PUZZLES = [
    {"id": 1, "title": "Мат в 1: Ладья", "fen": "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", "solution": "a1a8", "hint": "Ладья по последней горизонтали."},
    {"id": 2, "title": "Мат в 1: Ферзь", "fen": "6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1", "solution": "d1d8", "hint": "Ферзь по открытой линии."},
    {"id": 3, "title": "Мат в 1: Детский мат", "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1", "solution": "h5f7", "hint": "Ферзь + слон на f7."},
    {"id": 4, "title": "Мат в 1: Взятие с матом", "fen": "4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", "solution": "e1e8", "hint": "Бей фигуру соперника."},
]

# ============ ДЕБЮТЫ ============
OPENINGS = [
    {"id": "scotch_two_knights", "side": "white", "family": "Шотландская партия", "name": "Вариант двух коней", "moves": ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4", "Nf6", "Nxc6", "bxc6", "e5", "Qe7", "Qe2", "Nd5", "c4", "Ba6", "b3"], "description": "Острый вариант, где белые получают пространство и инициативу в центре.", "plans_white": "Захватить центр, использовать пешку e5 как клин.", "plans_black": "Использовать двух слонов и открытую линию 'b'."},
    {"id": "fried_liver", "side": "white", "family": "Шотландская партия", "name": "Атака «Жареная печень»", "moves": ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Nxd5", "Nxf7", "Kxf7", "Qf3+", "Ke6", "Nc3", "Nb4", "a3"], "description": "Яркая тактическая атака. Белые жертвуют коня на f7.", "plans_white": "Атаковать короля, вскрыть линии.", "plans_black": "Отбиться, вернуть материал и использовать лишнюю фигуру."},
    {"id": "french_winawer", "side": "black", "family": "Французская защита", "name": "Вариант Винавера", "moves": ["e4", "e6", "d4", "d5", "Nc3", "Bb4", "e5", "c5", "a3", "Bxc3+", "bxc3", "Ne7", "Qg4", "Qc7", "Qxg7", "Rg8", "Qxh7", "cxd4"], "description": "Самый острый вариант французской защиты.", "plans_white": "Использовать слабые поля, атаковать короля.", "plans_black": "Атаковать центр, использовать линию 'c'."},
    {"id": "french_classical", "side": "black", "family": "Французская защита", "name": "Классическая система", "moves": ["e4", "e6", "d4", "d5", "Nc3", "Nf6", "e5", "Nfd7", "f4", "c5", "Nf3", "Nc6", "Be3", "cxd4", "Nxd4", "Bc5", "Qd2", "O-O"], "description": "Надёжная классическая схема.", "plans_white": "Атаковать на королевском фланге.", "plans_black": "Подорвать центр ходом ...c5."}
]

POPULAR_OPENINGS = [
    ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"], ["e4", "e5", "Nf3", "Nc6", "Bb5"], ["e4", "e5", "Nf3", "Nc6", "d4"],
    ["e4", "e5", "Bc4"], ["e4", "e5", "Nc3"], ["e4", "e5", "f4"], ["e4", "e5", "Nf3", "Nf6"], ["e4", "c5", "Nf3", "d6"],
    ["e4", "c5", "Nf3", "Nc6"], ["e4", "c5", "Nc3"], ["e4", "c5", "c3"], ["e4", "e6", "d4", "d5"], ["e4", "e6", "d4", "d5", "Nc3"],
    ["e4", "c6"], ["e4", "d5"], ["e4", "d6"], ["e4", "Nf6"], ["d4", "d5", "c4", "e6"], ["d4", "d5", "c4", "c6"],
    ["d4", "Nf6", "c4", "g6"], ["d4", "Nf6", "c4", "e6"], ["d4", "Nf6", "c4", "e5"], ["d4", "f5"], ["c4"], ["Nf3"],
] + [o["moves"] for o in OPENINGS]

def is_book_move(history_san):
    for line in POPULAR_OPENINGS:
        if len(history_san) <= len(line):
            if history_san == line[:len(history_san)]:
                return True
    return False

RECOMMENDATION_RULES = {
    "вилк": "Отработка тактики: коневые и пешечные вилки", "связк": "Тренировка связок", "мат": "Матовые сети", 
    "зев": "Концентрация: проговаривать чек-лист", "время": "Тайм-менеджмент", "цейтнот": "Тайм-менеджмент",
    "дебют": "Углубить знания в дебюте", "эндшпиль": "Практика эндшпиля", "ферз": "Осторожность с ферзем",
    "фигур": "Безопасность фигур", "пешк": "Пешечная структура"
}

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

@app.get("/api/plan")
def get_plan():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT day_num FROM completed")
    done = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT day_num, text FROM notes")
    notes = {r[0]: r[1] for r in cur.fetchall()}
    conn.close()
    result = []
    for d in PLAN:
        item = dict(d)
        item["completed"] = d["day"] in done
        item["note"] = notes.get(d["day"], "")
        result.append(item)
    return {"plan": result, "total_days": len(PLAN), "completed_days": len(done)}

@app.get("/api/recommendations")
def get_recommendations():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT text FROM notes WHERE text IS NOT NULL AND text != ''")
    notes = [r[0].lower() for r in cur.fetchall()]
    conn.close()
    found_themes = set()
    for note in notes:
        for keyword, theme in RECOMMENDATION_RULES.items():
            if keyword in note: found_themes.add(theme)
    return {"recommendations": list(found_themes)}

@app.post("/api/complete")
def complete_day(body: CompleteBody):
    conn = sqlite3.connect(DB_PATH)
    if body.completed:
        conn.execute("INSERT OR REPLACE INTO completed (day_num, completed_at) VALUES (?, ?)", (body.day, date.today().isoformat()))
    else:
        conn.execute("DELETE FROM completed WHERE day_num=?", (body.day,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.post("/api/note")
def save_note(body: NoteBody):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("INSERT OR REPLACE INTO notes (day_num, text) VALUES (?, ?)", (body.day, body.text))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/puzzles")
def get_puzzles(): return {"puzzles": PUZZLES}

@app.get("/api/openings")
def get_openings(): return {"openings": OPENINGS}

# ============ ЛОГИКА АНАЛИЗА ============

PIECE_VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}

def is_true_sacrifice(board_before, move):
    piece = board_before.piece_at(move.from_square)
    if not piece or piece.piece_type == chess.PAWN: return False
    piece_val = PIECE_VALUES.get(piece.piece_type, 0)
    captured = board_before.piece_at(move.to_square)
    captured_val = PIECE_VALUES.get(captured.piece_type, 0) if captured else 0
    if captured_val >= piece_val: return False
    board_after = board_before.copy()
    board_after.push(move)
    to_sq = move.to_square
    if not board_after.is_attacked_by(not board_after.turn, to_sq): return False
    attackers = board_after.attackers(not board_after.turn, to_sq)
    defenders = board_after.attackers(board_after.turn, to_sq)
    if len(defenders) >= len(attackers): return False
    min_attacker_val = min([PIECE_VALUES.get(board_after.piece_at(a).piece_type, 0) for a in attackers])
    return min_attacker_val < piece_val

def format_pv(board, pv):
    temp_board = board.copy()
    res = []
    for m in pv[:8]:
        try:
            res.append(temp_board.san(m))
            temp_board.push(m)
        except: break
    return " ".join(res)

def parse_score(score_obj):
    if score_obj.is_mate():
        mate_in = score_obj.mate()
        return {"eval": 100 if mate_in > 0 else -100, "is_mate": True, "mate_in": mate_in}
    else:
        val = score_obj.score()
        if val is None: val = 0
        return {"eval": round(val / 100.0, 2), "is_mate": False, "mate_in": 0}

def get_multipv_lines(engine, board, depth=14):
    infos = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=3)
    lines = []
    for info in infos:
        if "pv" in info and info["pv"]:
            pv_san = format_pv(board, info["pv"])
            pv_score = parse_score(info["score"].white())
            lines.append({
                "san": board.san(info["pv"][0]), 
                "uci": info["pv"][0].uci(),
                "pv": pv_san, "eval": pv_score["eval"], 
                "is_mate": pv_score["is_mate"], "mate_in": pv_score["mate_in"]
            })
    return lines

def calc_expected_points(eval_cp):
    if eval_cp > 1000: return 1.0
    if eval_cp < -1000: return 0.0
    return 1 / (1 + math.exp(-0.00368208 * eval_cp))

def classify_move(is_best, is_sac, is_forced, prev_eval, curr_eval):
    if is_forced: return "forced"
    if prev_eval > 200 and curr_eval < 50: return "miss"
    if is_best and is_sac and prev_eval < 400 and curr_eval >= -100: return "brilliant"
    if is_best and abs(prev_eval - curr_eval) <= 10: return "great"
    
    ep_before = calc_expected_points(prev_eval * 100)
    ep_after = calc_expected_points(curr_eval * 100)
    ep_loss = ep_before - ep_after

    if ep_loss < 0.02: return "best" if is_best else "excellent"
    elif ep_loss < 0.05: return "good"
    elif ep_loss < 0.10: return "inaccuracy"
    elif ep_loss < 0.20: return "mistake"
    else: return "blunder"

@app.post("/api/analyze")
def analyze_game(body: AnalyzeBody):
    engine = None
    try:
        game = chess.pgn.read_game(io.StringIO(body.pgn))
        if not game: raise HTTPException(status_code=400, detail="Не удалось прочитать PGN")
        
        white_player = game.headers.get("White", "White")
        black_player = game.headers.get("Black", "Black")
        board = game.board()
        moves_data = []
        history_san = []
        moves_list = list(game.mainline_moves())
        evals = [] # Для графика
        
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        
        # Глубина 10 для всей партии (быстро), 14 для топа линий
        prev_info = engine.analyse(board, chess.engine.Limit(depth=10))
        prev_parsed = parse_score(prev_info["score"].white())
        prev_eval = prev_parsed["eval"]
        best_move_uci = prev_info["pv"][0].uci() if "pv" in prev_info else None

        for i, move in enumerate(moves_list):
            san_move = board.san(move)
            history_san.append(san_move)
            is_book = is_book_move(history_san)
            
            is_best = (best_move_uci == move.uci())
            is_forced = board.legal_moves.count() == 1
            is_sac = is_true_sacrifice(board, move)
            
            board.push(move)
            
            # Анализ после хода (глубина 10 для скорости)
            info_after = engine.analyse(board, chess.engine.Limit(depth=10))
            curr_parsed = parse_score(info_after["score"].white())
            curr_eval = curr_parsed["eval"]

            if i % 2 == 0: cp_loss = prev_eval - curr_eval
            else: cp_loss = curr_eval - prev_eval
            
            if is_book:
                classification = "book"
            else:
                classification = classify_move(is_best, is_sac, is_forced, prev_eval, curr_eval)
            
            # Для топа линий даем глубину 14 (только для текущей позиции)
            next_top_moves = get_multipv_lines(engine, board, depth=14)

            moves_data.append({
                "move_num": board.fullmove_number, 
                "san": san_move, "eval": curr_eval, 
                "is_mate": curr_parsed["is_mate"], "mate_in": curr_parsed["mate_in"],
                "cp_loss": max(0, cp_loss), "classification": classification, "fen": board.fen(),
                "next_top_moves": next_top_moves
            })
            
            # Записываем оценку для графика (ограничиваем от -10 до +10)
            graph_eval = max(-10, min(10, curr_eval))
            evals.append(graph_eval)
            
            prev_eval = curr_eval
            prev_parsed = curr_parsed
            best_move_uci = info_after["pv"][0].uci() if "pv" in info_after else None

        return {"moves": moves_data, "white_player": white_player, "black_player": black_player, "evals": evals}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if engine:
            engine.quit()

@app.post("/api/evaluate")
def evaluate_position(body: EvaluateBody):
    engine = None
    try:
        board = chess.Board(body.fen)
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        top_moves = get_multipv_lines(engine, board, depth=14)
        score_dict = parse_score(engine.analyse(board, chess.engine.Limit(depth=14))["score"].white())
        return {**score_dict, "top_moves": top_moves}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if engine:
            engine.quit()

@app.get("/", response_class=HTMLResponse)
def index():
    path = os.path.join(os.path.dirname(__file__), "index.html")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()