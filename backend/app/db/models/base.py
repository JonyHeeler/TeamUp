from sqlalchemy import DateTime, String
from sqlalchemy.dialects.mysql import CHAR, DATETIME
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Share SQLAlchemy metadata across all TeamUP models."""


uuid_type = String(36).with_variant(CHAR(36, charset="ascii", collation="ascii_bin"), "mysql")
utc_type = DateTime().with_variant(DATETIME(fsp=6), "mysql")
table_options = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}
