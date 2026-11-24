import hmac
import logging
import time
from contextlib import asynccontextmanager
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from app.api.routes import ACCOUNT_COOKIE, router
from app.config import get_settings
from app.db.session import SessionLocal
from app.services import accounts, teamup


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if settings.auth_mode == "student":
        origin = urlsplit(settings.allowed_origin)
        local = origin.scheme == "http" and origin.hostname in {"localhost", "127.0.0.1", "::1"}
        if not origin.hostname or (origin.scheme != "https" and not local):
            raise ValueError("Student authentication requires HTTPS outside localhost")
        if len(settings.session_secret.encode()) < 32:
            raise ValueError("TEAMUP_SESSION_SECRET must be at least 32 bytes")
        accounts.password_blocklist()
    yield


app = FastAPI(title="TeamUP API", version="1.0.0", lifespan=lifespan)
app.include_router(router)
logger = logging.getLogger("uvicorn.teamup")
logging.getLogger("uvicorn.access").disabled = True


def error(status: int, code: str, message: str, fields: dict | None = None) -> JSONResponse:
    body = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    return JSONResponse(
        status_code=status, content={"error": body}, headers={"Cache-Control": "no-store"}
    )


AUTH_FORMS = {"/auth/register", "/auth/login", "/auth/password/reset/confirm"}
PUBLIC_PATHS = AUTH_FORMS | {
    "/auth/capabilities",
    "/health/ready",
    "/competitions",
    "/demo/session",
}
MUTATIONS = {"POST", "PUT", "PATCH", "DELETE"}


def find_account_user(token: str | None) -> str | None:
    with SessionLocal() as db:
        return accounts.session_user(db, token)


async def check_request(request: Request):
    settings = get_settings()
    mode = settings.auth_mode
    mutating = request.method in MUTATIONS
    path = request.url.path.removeprefix("/api/v1")
    if mutating and request.headers.get("origin") != settings.allowed_origin:
        return error(403, "invalid_origin", "请求来源不受信任")
    if not request.url.path.startswith("/api/v1/"):
        return None
    if mode != "student" and path.startswith("/auth/") and path != "/auth/capabilities":
        return error(404, "not_found", "账户模式未启用")
    if mode == "off" and path.split("/")[1] in {"profiles", "recruitments"}:
        return error(401, "unauthorized", "此环境未开放资料查询")
    if mode != "student":
        return None
    if mutating and path in AUTH_FORMS:
        content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type != "application/json":
            return error(415, "invalid_content_type", "请求必须使用 JSON")
    if path in PUBLIC_PATHS:
        return None
    token = request.cookies.get(ACCOUNT_COOKIE)
    user = await run_in_threadpool(find_account_user, token) if token else None
    if not user or not token:
        return error(401, "unauthorized", "请先登录")
    if mutating and not hmac.compare_digest(
        request.headers.get("X-CSRF-Token", "").encode(), accounts.csrf(token).encode()
    ):
        return error(403, "invalid_csrf", "请求验证失败")
    request.state.account_user = user
    return None


@app.middleware("http")
async def security_and_log(request: Request, call_next):
    start = time.monotonic()
    request_id = str(uuid4())
    try:
        response = await check_request(request)
        if response is None:
            response = await call_next(request)
    except SQLAlchemyError:
        response = error(503, "database_unavailable", "数据库暂不可用")
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Request-ID"] = request_id
    logger.info("%s %s %.3f", request_id, response.status_code, time.monotonic() - start)
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return error(
        exc.status_code, "not_found" if exc.status_code == 404 else "http_error", "请求无法完成"
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    fields = {".".join(str(x) for x in e["loc"][1:]): e["msg"] for e in exc.errors()}
    return error(422, "validation_error", "输入无效", fields)


@app.exception_handler(teamup.ServiceError)
async def service_error(request: Request, exc: teamup.ServiceError):
    return error(exc.status, exc.code, exc.message, exc.fields)
