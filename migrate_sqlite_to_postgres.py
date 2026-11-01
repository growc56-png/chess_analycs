
import sqlite3
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from database import engine

SQLITE_PATH = Path(__file__).resolve().parent / "chess_trainer.db"

TABLES = [
    "completed",
    "notes",
    "activity",
    "streak_results",
    "mate_records",
]

source = sqlite3.connect(SQLITE_PATH)
source.row_factory = sqlite3.Row

try:
    with engine.begin() as conn:
        for table in TABLES:
            rows = source.execute(f'SELECT * FROM "{table}"').fetchall()

            if not rows:
                print(f"{table}: 0 записей")
                continue

            columns = rows[0].keys()
            column_sql = ", ".join(f'"{c}"' for c in columns)
            values_sql = ", ".join(f":{c}" for c in columns)

            query = text(
                f'INSERT INTO "{table}" ({column_sql}) '
                f'VALUES ({values_sql})'
            )

            conn.execute(query, [dict(row) for row in rows])
            print(f"{table}: перенесено {len(rows)} записей")

        conn.execute(text("""
            SELECT setval(
                pg_get_serial_sequence('streak_results', 'id'),
                COALESCE((SELECT MAX(id) FROM streak_results), 1),
                EXISTS (SELECT 1 FROM streak_results)
            )
        """))

    print("\nПеренос завершён!")

finally:
    source.close()
