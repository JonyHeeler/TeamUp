from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.dependencies import DB_DEP, errors
from app.api.schemas.system import Ready

BACKEND_ROOT = Path(__file__).resolve().parents[3]

router = APIRouter()


# Return readiness only when MySQL is reachable and all migrations are applied.
@router.get("/health/ready", response_model=Ready, responses=errors(503))
def ready(db: Session = DB_DEP):
    try:
        db.execute(text("SELECT 1"))
        actual = set(db.execute(text("SELECT version_num FROM alembic_version")).scalars())
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
        expected = set(ScriptDirectory.from_config(config).get_heads())
        if actual != expected:
            raise ValueError("migration mismatch")
    except (SQLAlchemyError, ValueError, OSError):
        return JSONResponse(
            status_code=503,
            content={"error": {"code": "not_ready", "message": "数据库或迁移不可用"}},
        )
    return {"status": "ready"}
