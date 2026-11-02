"""Cookie-based authentication helpers for Chess Trainer."""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
from models.user import AuthSession, User


SESSION_COOKIE_NAME = "chess_session"
SESSION_LIFETIME_DAYS = 30
PBKDF2_ITERATIONS = 310_000


def hash_password(password: str) -> str:
    import base64

    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return "pbkdf2_sha256$%s$%s$%s" % (
        PBKDF2_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored_hash: str) -> bool:
    import base64

    try:
        algorithm, iterations, salt_text, digest_text = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        rounds = int(iterations)
        if rounds < 100_000 or rounds > 1_000_000:
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            rounds,
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, UnicodeError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(48)
    session = AuthSession(
        token_hash=token_digest(token),
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_LIFETIME_DAYS),
    )
    db.add(session)
    db.commit()
    return token


def remove_session(db: Session, token: str | None) -> None:
    if not token:
        return
    db.query(AuthSession).filter(
        AuthSession.token_hash == token_digest(token)
    ).delete(synchronize_session=False)
    db.commit()


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется войти в аккаунт.",
        )

    session = db.get(AuthSession, token_digest(token))
    if session is None:
        raise HTTPException(status_code=401, detail="Сессия недействительна. Войди снова.")

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=401, detail="Срок сессии истёк. Войди снова.")

    user = db.get(User, session.user_id)
    if user is None:
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=401, detail="Аккаунт не найден.")

    return user


def set_session_cookie(response, token: str, secure: bool = False) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_LIFETIME_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


__all__ = [
    "SESSION_COOKIE_NAME",
    "hash_password",
    "verify_password",
    "create_session",
    "remove_session",
    "get_current_user",
    "set_session_cookie",
]
