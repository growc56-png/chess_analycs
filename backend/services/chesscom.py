import json
import time
import urllib.request
import urllib.error
import ssl

from fastapi import HTTPException


HEADERS = {
    "User-Agent": "ChessTrainer/1.0 (game archive reader)",
    "Accept": "application/json"
}


def get_json(url: str):
    """
    Получает JSON с Chess.com.
    Повторяет запрос при временных сетевых ошибках.
    """

    last_error = None

    for attempt in range(4):
        req = urllib.request.Request(
            url,
            headers={
                **HEADERS,
                "Accept-Encoding": "identity",
                "Connection": "close",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                raw = response.read()
                return json.loads(raw.decode("utf-8"))

        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise HTTPException(
                    status_code=404,
                    detail="Chess.com не нашёл игрока или архив партий"
                )

            if exc.code == 429:
                raise HTTPException(
                    status_code=429,
                    detail="Chess.com временно ограничил запросы. Попробуй через минуту"
                )

            if exc.code in (500, 502, 503, 504):
                last_error = f"Chess.com вернул HTTP {exc.code}"
            else:
                raise HTTPException(
                    status_code=502,
                    detail=f"Ошибка Chess.com: HTTP {exc.code}"
                )

        except (
            urllib.error.URLError,
            TimeoutError,
            ssl.SSLError,
            ConnectionError,
            OSError
        ) as exc:
            last_error = str(getattr(exc, "reason", exc))

        except json.JSONDecodeError:
            raise HTTPException(
                status_code=502,
                detail="Chess.com вернул некорректный JSON"
            )

        if attempt < 3:
            time.sleep(0.7 * (2 ** attempt))

    raise HTTPException(
        status_code=502,
        detail=(
            "Chess.com несколько раз оборвал защищённое соединение. "
            "Попробуй повторить загрузку через 30–60 секунд. Подробности: "
            + str(last_error)
        )
    )


def fetch_chesscom_games(username: str, limit: int = 60):
    """
    Получает профиль и последние партии игрока Chess.com.
    """

    profile = get_json(
        f"https://api.chess.com/pub/player/{username}"
    )

    archives_data = get_json(
        f"https://api.chess.com/pub/player/{username}/games/archives"
    )

    archives = archives_data.get("archives") or []

    if not archives:
        return {
            "username": profile.get("username", username),
            "games": []
        }

    collected = []

    # Сначала загружаем самый свежий архив.
    for archive_url in reversed(archives):
        month_data = get_json(archive_url)

        collected.extend(
            month_data.get("games") or []
        )

        if len(collected) >= limit:
            break

    collected.sort(
        key=lambda game: game.get("end_time", 0),
        reverse=True
    )

    return {
        "username": profile.get("username", username),
        "games": collected[:limit]
    }