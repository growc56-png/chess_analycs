from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class BotGame(Base):
    __tablename__ = "bot_games"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    pgn: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    player_color: Mapped[str] = mapped_column(
        String(1),
        nullable=False,
    )

    bot_level: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    time_control: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="unlimited",
    )

    result: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    termination: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="unknown",
    )

    moves_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    final_fen: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    analysis_data: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )

    analyzed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )