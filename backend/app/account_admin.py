import argparse
from urllib.parse import urlencode

from app.config import get_settings
from app.db.session import SessionLocal
from app.services.accounts import issue_ticket, set_account_status
from app.services.common import ServiceError


def main() -> None:
    """Issue account tickets or change account status from the operator CLI."""
    parser = argparse.ArgumentParser(description="TeamUP 学号账号管理")
    parser.add_argument("action", choices=("activate", "reset", "suspend", "restore"))
    args = parser.parse_args()
    settings = get_settings()
    if settings.auth_mode != "student":
        parser.error("请连接独立的学生账号环境")

    try:
        student_id = input("已核验的学号：")
        with SessionLocal() as db:
            if args.action in {"activate", "reset"}:
                expires_in = 3600 if args.action == "activate" else 900
                token = issue_ticket(db, student_id, args.action, expires_in_seconds=expires_in)
                path = "register" if args.action == "activate" else "reset-password"
                print(f"{settings.allowed_origin}/{path}#{urlencode({'token': token})}")
            else:
                status = "suspended" if args.action == "suspend" else "active"
                set_account_status(db, student_id, status)
                print("账号状态已更新。")
    except ServiceError as error:
        parser.error(error.message)


if __name__ == "__main__":
    main()
