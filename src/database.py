"""Database session management for the FastAPI application.

Provides SQLAlchemy engine and session factory, configured from DATABASE_URL.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/docdb",
)
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)


POOL_SIZE = int(os.environ.get("DB_POOL_SIZE", "20"))
MAX_OVERFLOW = int(os.environ.get("DB_MAX_OVERFLOW", "10"))

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Session:
    """Yield a database session for FastAPI dependency injection."""
    db = SessionLocal()
    try:
        yield db  # type: ignore[misc]
    finally:
        db.close()
