import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class Settings:
    @property
    def database_url(self) -> URL:
        return URL.create(
            "mysql+pymysql",
            username=os.getenv("TEAMUP_DB_USER", "teamup_app"),
            password=os.getenv("TEAMUP_DB_PASSWORD", ""),
            host=os.getenv("TEAMUP_DB_HOST", "127.0.0.1"),
            port=int(os.getenv("TEAMUP_DB_PORT", "3309")),
            database=os.getenv("TEAMUP_DB_NAME", "teamup"),
            query={"charset": "utf8mb4"},
        )

    @property
    def auth_mode(self) -> str:
        explicit = os.getenv("TEAMUP_AUTH_MODE")
        legacy = os.getenv("TEAMUP_DEMO_MODE")
        if explicit is not None and explicit not in {"off", "demo", "student"}:
            raise ValueError("Invalid TEAMUP_AUTH_MODE")
        if legacy is not None and legacy.lower() not in {"true", "false"}:
            raise ValueError("Invalid TEAMUP_DEMO_MODE")
        if explicit and legacy and ((legacy.lower() == "true") != (explicit == "demo")):
            raise ValueError("Conflicting authentication modes")
        mode = explicit or ("demo" if legacy and legacy.lower() == "true" else "off")
        if mode == "student" and os.getenv("TEAMUP_DB_NAME", "teamup") == "teamup":
            raise ValueError("Student mode requires a separate database")
        return mode

    @property
    def demo_mode(self) -> bool:
        return self.auth_mode == "demo"

    @property
    def session_secret(self) -> str:
        return os.getenv("TEAMUP_SESSION_SECRET", "")

    @property
    def allowed_origin(self) -> str:
        return os.getenv("TEAMUP_ALLOWED_ORIGIN", "http://127.0.0.1:5180").rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
