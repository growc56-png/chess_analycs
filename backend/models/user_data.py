from sqlalchemy import ForeignKey, Integer, String, Text, Float
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class UserCompleted(Base):
    __tablename__ = "user_completed"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day_num: Mapped[int] = mapped_column(Integer, primary_key=True)
    completed_at: Mapped[str | None] = mapped_column(Text, nullable=True)


class UserNote(Base):
    __tablename__ = "user_notes"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day_num: Mapped[int] = mapped_column(Integer, primary_key=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)


class UserActivity(Base):
    __tablename__ = "user_activity"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day_date: Mapped[str] = mapped_column(String(10), primary_key=True)


class UserStreakResult(Base):
    __tablename__ = "user_streak_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    result: Mapped[str] = mapped_column(String(10), nullable=False)


class UserMateRecord(Base):
    __tablename__ = "user_mate_records"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    mate_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    best_time: Mapped[float | None] = mapped_column(Float, nullable=True)
