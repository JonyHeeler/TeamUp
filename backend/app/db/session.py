from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import get_settings


@lru_cache
def engine_for_url(url):
    return create_engine(url, pool_pre_ping=True)


def get_engine():
    return engine_for_url(get_settings().database_url)


def SessionLocal():
    return Session(get_engine(), expire_on_commit=False)


def get_db():
    with SessionLocal() as session:
        yield session
