import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from app.api.routes import router
from app.config import get_settings
from app.services import teamup

app = FastAPI(title="TeamUp API", version="1.0.0")
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


@app.middleware("http")
async def security_and_log(request: Request, call_next):
    start = time.monotonic()
    request_id = str(uuid4())
    if (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and request.headers.get("origin") != get_settings().allowed_origin
    ):
        response = error(403, "invalid_origin", "请求来源不受信任")
    else:
        try:
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
