"""ORM models. Each row carries the full record in a JSONB ``data`` column.

Top-level ``id``/``token`` are duplicated out of ``data`` for indexed lookups;
the data layer (store.py) keeps them in sync on every upsert.
"""
from sqlalchemy import JSON, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

# Portable JSON column: JSONB on Postgres, generic JSON (TEXT-backed) on SQLite
# and others, so the same models run against either backend.
JSONType = JSON().with_variant(JSONB(), "postgresql")


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    token: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    data: Mapped[dict] = mapped_column(JSONType, nullable=False)


class Carrier(Base):
    __tablename__ = "carriers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    token: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    data: Mapped[dict] = mapped_column(JSONType, nullable=False)


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    data: Mapped[dict] = mapped_column(JSONType, nullable=False)


class OptOut(Base):
    __tablename__ = "sms_optouts"

    phone: Mapped[str] = mapped_column(String, primary_key=True)


class KV(Base):
    """Tiny key/value table for module-local persistence (none required yet)."""

    __tablename__ = "kv"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
