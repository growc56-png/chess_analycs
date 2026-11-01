import os
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
BASE_DIR = BACKEND_DIR.parent

load_dotenv(BASE_DIR / ".env")

# HTML, CSS и JavaScript хранятся в front, изображения фигур — в корневой img.
FRONT_DIR = BASE_DIR / "front"
HTML_DIR = FRONT_DIR / "html"
CSS_DIR = FRONT_DIR / "css"
JS_DIR = FRONT_DIR / "js"
IMG_DIR = BASE_DIR / "img"

STOCKFISH_PATH = BASE_DIR / "stockfish-windows-x86-64-universal.exe"

DATABASE_URL = os.getenv("DATABASE_URL")

ANALYSIS_DEPTH = int(os.getenv("CHESS_ANALYSIS_DEPTH", "15"))
ANALYSIS_TIME = float(os.getenv("CHESS_ANALYSIS_TIME", "1.2"))

EVALUATE_DEPTH = int(os.getenv("CHESS_EVALUATE_DEPTH", "15"))
EVALUATE_TIME = float(os.getenv("CHESS_EVALUATE_TIME", "1.2"))

for folder in (HTML_DIR, CSS_DIR, JS_DIR, IMG_DIR):
    folder.mkdir(parents=True, exist_ok=True)
