"""One-time local setup for the RoadTo2000 administrator.

Run from backend/: python -m scripts.bootstrap_admin
The additional password is entered with hidden terminal input and is never stored in source code.
"""
import getpass
import re
import sys

from sqlalchemy import func

from database import SessionLocal
from models.user import AuthSession, User
from services.auth import hash_password


ADMIN_USERNAME = "RoadTo2000"


def main() -> int:
    db = SessionLocal()
    try:
        user = db.query(User).filter(func.lower(User.username) == ADMIN_USERNAME.lower()).one_or_none()
        if user is None:
            print(f"Аккаунт {ADMIN_USERNAME} не найден. Сначала войди/зарегистрируй его.")
            return 1
        if user.is_admin:
            print("Администратор уже активирован. Повторная первичная настройка запрещена.")
            return 1
        print(f"Будет выдана роль администратора существующему аккаунту {user.username}.")
        print("Создай отдельный пароль (не используй обычный пароль сайта).")
        password = getpass.getpass("Новый дополнительный пароль: ")
        confirm = getpass.getpass("Повтори дополнительный пароль: ")
        if password != confirm:
            print("Пароли не совпадают.")
            return 1
        if len(password) < 16 or not re.search(r"[A-ZА-Я]", password) or not re.search(r"[a-zа-я]", password) or not re.search(r"\d", password):
            print("Нужно минимум 16 символов, включая заглавную, строчную букву и цифру.")
            return 1
        user.admin_password_hash = hash_password(password)
        user.is_admin = True
        db.query(AuthSession).delete(synchronize_session=False)
        db.commit()
        print("Администратор активирован. Все старые сессии отозваны — войди заново.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
