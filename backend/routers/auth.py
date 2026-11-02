"""Registration, login and personal goal setup."""

import os
import re
import time
from collections import defaultdict, deque
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.user_data import UserCompleted, UserNote
from services.auth import (
    SESSION_COOKIE_NAME,
    create_session,
    get_current_user,
    hash_password,
    remove_session,
    set_session_cookie,
    verify_password,
)


router = APIRouter(tags=["authentication"])
ATTEMPT_WINDOW_SECONDS = 15 * 60
MAX_ATTEMPTS_PER_WINDOW = 8
_attempts = defaultdict(deque)


class RegisterBody(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    username: str = Field(min_length=3, max_length=24)
    password: str = Field(min_length=10, max_length=128)


class LoginBody(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ProfileBody(BaseModel):
    current_elo: int = Field(ge=800, le=2000)
    target_elo: int = Field(ge=800, le=2000)
    goal_days: int = Field(ge=7, le=1095)
    daily_minutes: int = Field(ge=30, le=480)


def _rate_limit_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _check_auth_rate_limit(request: Request) -> None:
    now = time.monotonic()
    key = _rate_limit_key(request)
    bucket = _attempts[key]
    while bucket and now - bucket[0] > ATTEMPT_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= MAX_ATTEMPTS_PER_WINDOW:
        raise HTTPException(
            status_code=429,
            detail="Слишком много попыток. Подожди 15 минут и попробуй снова.",
        )
    bucket.append(now)


def _valid_email(email: str) -> bool:
    email = email.strip()
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", email))


def _valid_username(username: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_-]{3,24}", username))


def _user_payload(user: User) -> dict:
    profile_ready = bool(
        user.onboarding_completed
        and user.current_elo is not None
        and user.target_elo is not None
        and user.goal_days is not None
        and user.daily_minutes is not None
    )
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "needs_setup": not profile_ready,
        "profile": {
            "current_elo": user.current_elo,
            "target_elo": user.target_elo,
            "goal_days": user.goal_days,
            "daily_minutes": user.daily_minutes,
            "goal_started_on": user.goal_started_on.isoformat() if user.goal_started_on else None,
        } if profile_ready else None,
    }


def _secure_cookie(request: Request) -> bool:
    configured = os.getenv("CHESS_COOKIE_SECURE")
    if configured is not None:
        return configured.strip().lower() in {"1", "true", "yes", "on"}
    return request.url.scheme == "https"


@router.post("/api/auth/register", status_code=201)
def register(
    body: RegisterBody,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    _check_auth_rate_limit(request)
    email = body.email.strip().lower()
    username = body.username.strip()

    if not _valid_email(email):
        raise HTTPException(status_code=422, detail="Укажи корректный адрес электронной почты.")
    if not _valid_username(username):
        raise HTTPException(status_code=422, detail="Ник должен содержать 3–24 символа: латинские буквы, цифры, _ или -.")
    if len(body.password) < 10:
        raise HTTPException(status_code=422, detail="Пароль должен содержать не менее 10 символов.")

    email_exists = db.query(User.id).filter(func.lower(User.email) == email).first()
    username_exists = db.query(User.id).filter(func.lower(User.username) == username.lower()).first()
    if email_exists:
        raise HTTPException(status_code=409, detail="Аккаунт с этой почтой уже существует.")
    if username_exists:
        raise HTTPException(status_code=409, detail="Этот ник уже занят.")

    user = User(
        email=email,
        username=username,
        password_hash=hash_password(body.password),
        onboarding_completed=False,
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Почта или ник уже используются.")

    token = create_session(db, user)
    set_session_cookie(response, token, secure=_secure_cookie(request))
    return {"ok": True, "user": _user_payload(user)}


@router.post("/api/auth/login")
def login(
    body: LoginBody,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    _check_auth_rate_limit(request)
    email = body.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()

    # Не раскрываем, существует ли конкретная почта.
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверная почта или пароль.")

    token = create_session(db, user)
    set_session_cookie(response, token, secure=_secure_cookie())
    return {"ok": True, "user": _user_payload(user)}


@router.get("/api/auth/me")
def current_account(user: User = Depends(get_current_user)):
    return {"user": _user_payload(user)}


@router.post("/api/auth/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    remove_session(db, token)
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=_secure_cookie(request),
        samesite="lax",
    )
    return {"ok": True}


@router.get("/api/profile")
def get_profile(user: User = Depends(get_current_user)):
    return {"user": _user_payload(user)["profile"], "needs_setup": not user.onboarding_completed}


@router.post("/api/profile")
def save_profile(
    body: ProfileBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.target_elo < body.current_elo:
        raise HTTPException(
            status_code=422,
            detail="Целевой рейтинг должен быть не ниже текущего.",
        )

    # Изменение цели начинает новый план. Историю дневника и партий сохраняем,
    # но галочки и заметки старого расписания не переносим на новые задания.
    if user.onboarding_completed:
        db.query(UserCompleted).filter(UserCompleted.user_id == user.id).delete(synchronize_session=False)
        db.query(UserNote).filter(UserNote.user_id == user.id).delete(synchronize_session=False)

    user.current_elo = body.current_elo
    user.target_elo = body.target_elo
    user.goal_days = body.goal_days
    user.daily_minutes = body.daily_minutes
    user.goal_started_on = date.today()
    user.onboarding_completed = True
    db.commit()
    db.refresh(user)
    return {"ok": True, "user": _user_payload(user)}


__all__ = ["router"]
