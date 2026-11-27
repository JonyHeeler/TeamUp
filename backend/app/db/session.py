from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import get_settings


@lru_cache
def engine_for_url(url):
    """Reuse an engine and its connection pool for this database URL."""
    return create_engine(url, pool_pre_ping=True)


def get_engine():
    """Select the engine for the current settings."""
    return engine_for_url(get_settings().database_url)


def SessionLocal():
    """Create a session for one request or command."""
    return Session(get_engine(), expire_on_commit=False)


def get_db():
    """Yield and close a database session for a FastAPI request."""
    with SessionLocal() as session:
        yield session
