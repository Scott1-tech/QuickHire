"""Async SQLAlchemy engine + session factory and table bootstrap.

The original app stored everything as nested JSON. To stay faithful to those
shapes (the frontend consumes them verbatim) each entity is one row with a
JSONB ``data`` column holding the full record, plus a couple of indexed
columns (``id``, ``token``) used for lookups. This keeps the data layer a thin
mirror of the old ``readAll()/upsert()`` helpers while running on Postgres.
"""
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from . import config


class Base(DeclarativeBase):
    pass


engine = create_async_engine(config.DATABASE_URL, future=True, pool_pre_ping=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    # Import models so they register on Base.metadata before create_all.
    from . import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
