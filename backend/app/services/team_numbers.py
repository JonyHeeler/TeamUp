from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.orm import Session

from app.db.models import TeamNumberCounter

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
MAX_SEQUENCE = len(ALPHABET) ** 3 - 1


class TeamNumberExhausted(ValueError):
    pass


def next_team_number(db: Session, created_at: datetime) -> str:
    day = (created_at + timedelta(hours=8)).strftime("%Y%m%d")
    allocation = insert(TeamNumberCounter).values(day=day, last_index=1)
    db.execute(allocation.on_duplicate_key_update(last_index=TeamNumberCounter.last_index + 1))
    index = db.scalar(
        select(TeamNumberCounter.last_index).where(TeamNumberCounter.day == day).with_for_update()
    )
    if index is None or index > MAX_SEQUENCE:
        raise TeamNumberExhausted("今天的队伍编号已用完，请明天再创建")
    suffix = "".join(
        ALPHABET[(index // len(ALPHABET) ** offset) % len(ALPHABET)] for offset in (2, 1, 0)
    )
    return day + suffix
