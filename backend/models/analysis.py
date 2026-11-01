from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Completed(Base):
    __tablename__ = "completed"

    day_num: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    completed_at: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )


class Note(Base):
    __tablename__ = "notes"

    day_num: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )


class Activity(Base):
    __tablename__ = "activity"

    day_date: Mapped[str] = mapped_column(
        String,
        primary_key=True
    )


class StreakResult(Base):
    __tablename__ = "streak_results"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    date: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    result: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )