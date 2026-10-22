from uuid import uuid4

from sqlalchemy import Boolean, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RepairShop(Base):
    __tablename__ = "repair_shops"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(300))
    latitude: Mapped[float] = mapped_column(Float, index=True)
    longitude: Mapped[float] = mapped_column(Float, index=True)
    phone_number: Mapped[str | None] = mapped_column(String(30))
    rating: Mapped[float | None] = mapped_column(Float)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)