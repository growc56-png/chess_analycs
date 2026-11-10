import os
import shutil
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
BASE_DIR = BACKEND_DIR.parent

load_dotenv(BASE_DIR / ".env")

# HTML, CSS and JavaScript live in front; piece images are in the repository root.
FRONT_DIR = BASE_DIR / "front"
HTML_DIR = FRONT_DIR / "html"
CSS_DIR = FRONT_DIR / "css"
JS_DIR = FRONT_DIR / "js"
IMG_DIR = BASE_DIR / "img"


def _int_setting(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _float_setting(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    if not (value == value):  # NaN guard
        value = default
    return max(minimum, min(maximum, value))


def _resolve_stockfish_path() -> Path:
    configured = os.getenv("STOCKFISH_PATH", "").strip()
    if configured:
        candidate = Path(configured).expanduser()
        return candidate if candidate.is_absolute() else (BASE_DIR / candidate).resolve()

    # Prefer repository-local releases installed by scripts/install_stockfish.py.
    candidates = (
        # Support both the repository root (installer default) and backend/,
        # where users may already keep the Windows executable.
        BASE_DIR / "stockfish-windows-x86-64-universal.exe",
        BACKEND_DIR / "stockfish-windows-x86-64-universal.exe",
        BASE_DIR / "stockfish-windows-arm64-universal.exe",
        BACKEND_DIR / "stockfish-windows-arm64-universal.exe",
        BASE_DIR / "stockfish.exe",
        BACKEND_DIR / "stockfish.exe",
        BASE_DIR / "stockfish",
        BACKEND_DIR / "stockfish",
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate

    installed = shutil.which("stockfish")
    if installed:
        return Path(installed)
    # Preserve a useful default path in the error message on fresh Windows installs.
    return candidates[0]


STOCKFISH_PATH = _resolve_stockfish_path()
DATABASE_URL = os.getenv("DATABASE_URL")

CPU_COUNT = os.cpu_count() or 2
# On a shared web server, leave at least one logical CPU available to the OS.
_DEFAULT_ENGINE_THREADS = max(1, min(4, CPU_COUNT - 1))
ENGINE_THREADS = min(CPU_COUNT, _int_setting("CHESS_ENGINE_THREADS", _DEFAULT_ENGINE_THREADS, 1, 64))
ENGINE_HASH_MB = _int_setting("CHESS_ENGINE_HASH_MB", 256, 16, 4096)
BOT_ENGINE_THREADS = min(CPU_COUNT, _int_setting("CHESS_BOT_ENGINE_THREADS", 1, 1, 16))
BOT_ENGINE_HASH_MB = _int_setting("CHESS_BOT_ENGINE_HASH_MB", 64, 16, 1024)

ANALYSIS_DEPTH = _int_setting("CHESS_ANALYSIS_DEPTH", 18, 8, 40)
ANALYSIS_TIME = _float_setting("CHESS_ANALYSIS_TIME", 2.0, 0.1, 120.0)

# Deep verification is limited to critical moves to keep full-game analysis usable.
DEEP_ANALYSIS_DEPTH = _int_setting("CHESS_DEEP_ANALYSIS_DEPTH", 23, 10, 45)
DEEP_ANALYSIS_TIME = _float_setting("CHESS_DEEP_ANALYSIS_TIME", 2.5, 0.2, 180.0)
MAX_DEEP_ANALYSIS_MOVES = _int_setting("CHESS_MAX_DEEP_ANALYSIS_MOVES", 16, 0, 100)

BRILLIANT_ANALYSIS_DEPTH = _int_setting("CHESS_BRILLIANT_ANALYSIS_DEPTH", 26, 12, 50)
BRILLIANT_ANALYSIS_TIME = _float_setting("CHESS_BRILLIANT_ANALYSIS_TIME", 4.0, 0.3, 240.0)

EVALUATE_DEPTH = _int_setting("CHESS_EVALUATE_DEPTH", 15, 8, 40)
EVALUATE_TIME = _float_setting("CHESS_EVALUATE_TIME", 1.2, 0.1, 60.0)
MAX_PENDING_ANALYSES = _int_setting("CHESS_MAX_PENDING_ANALYSES", 2, 1, 20)

for folder in (HTML_DIR, CSS_DIR, JS_DIR, IMG_DIR):
    folder.mkdir(parents=True, exist_ok=True)
