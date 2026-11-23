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
    def demo_mode(self) -> bool:
        return os.getenv("TEAMUP_DEMO_MODE", "false").lower() == "true"

    @property
    def session_secret(self) -> str:
        return os.getenv("TEAMUP_SESSION_SECRET", "")

    @property
    def allowed_origin(self) -> str:
        return os.getenv("TEAMUP_ALLOWED_ORIGIN", "http://127.0.0.1:5180").rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
