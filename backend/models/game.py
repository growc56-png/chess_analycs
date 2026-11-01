from sqlalchemy import String, Float
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class MateRecord(Base):
    __tablename__ = "mate_records"

    mate_id: Mapped[str] = mapped_column(
        String,
        primary_key=True
    )

    best_time: Mapped[float | None] = mapped_column(
        Float,
        nullable=True
    )