# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database.models import Base

# Use SQLite by default (no psycopg2 required). Set DATABASE_URL to a postgres URL only when using PostgreSQL.
_default_sqlite = "sqlite+aiosqlite:///./corto.db"
_env_url = (os.getenv("DATABASE_URL") or "").strip()
if not _env_url or "postgresql" in _env_url or _env_url.startswith("postgres://"):
    DATABASE_URL = _default_sqlite
else:
    DATABASE_URL = _env_url

engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "").lower() in ("1", "true", "yes"),
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session. Caller is responsible for commit/rollback."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


def _add_resume_blobs_parsed_schema(conn) -> None:
    """Add parsed_schema column to resume_blobs if missing (one-off migration)."""
    result = conn.execute(
        text("SELECT 1 FROM pragma_table_info('resume_blobs') WHERE name = 'parsed_schema'")
    )
    if result.fetchone() is None:
        conn.execute(text("ALTER TABLE resume_blobs ADD COLUMN parsed_schema TEXT"))


async def init_db() -> None:
    """Create all tables. Safe to call on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_resume_blobs_parsed_schema)
