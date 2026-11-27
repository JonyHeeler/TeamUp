from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.base import Base, table_options, uuid_type


class User(Base):
    """Store the common identity used by demo personas and student accounts."""

    __tablename__ = "users"
    __table_args__ = table_options
    id: Mapped[str] = mapped_column(uuid_type, primary_key=True)
    nickname: Mapped[str] = mapped_column(String(80))


class Contact(Base):
    """Store the private QQ contact for one user."""

    __tablename__ = "contacts"
    __table_args__ = table_options
    user_id: Mapped[str] = mapped_column(uuid_type, ForeignKey("users.id"), primary_key=True)
    qq: Mapped[str] = mapped_column(String(64))
