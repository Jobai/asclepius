"""Additive, language-neutral error codes. Existing detail/status/headers stay intact."""

import json
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


class ErrorCode(StrEnum):
    INVALID_CREDENTIALS = "invalid_credentials"
    AUTHENTICATION_REQUIRED = "authentication_required"
    SESSION_EXPIRED = "session_expired"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    INVALID_REQUEST = "invalid_request"
    VALIDATION_ERROR = "validation_error"
    UPLOAD_TOO_LARGE = "upload_too_large"
    UNSUPPORTED_FILE_TYPE = "unsupported_file_type"
    INVALID_ARCHIVE = "invalid_archive"
    UNSAFE_FILENAME = "unsafe_filename"
    RATE_LIMITED = "rate_limited"
    RATE_LIMITED_RETRY = "rate_limited_retry"
    SHARE_EXPIRED = "share_expired"
    SHARE_CODE_INVALID = "share_code_invalid"
    SHARE_QUEUE_EXPIRED = "share_queue_expired"
    SHARE_SESSION_ENDED = "share_session_ended"
    SERVICE_UNAVAILABLE = "service_unavailable"
    OTP_DELIVERY_FAILED = "otp_delivery_failed"
    TRANSLATION_UNAVAILABLE = "translation_unavailable"
    LANGUAGE_NOT_ALLOWED = "language_not_allowed"
    DOCUMENT_UNAVAILABLE = "document_unavailable"


class ApiErrorResponse(BaseModel):
    # Optional code/params also describe ordinary, unconverted HTTP exceptions.
    detail: Any
    code: ErrorCode | None = None
    params: dict[str, int] | None = None


class ValidationError(BaseModel):
    """Retain FastAPI's published validation fields and schema names."""

    loc: list[str | int]
    msg: str
    type: str


class HTTPValidationError(BaseModel):
    detail: list[ValidationError] = Field(default_factory=list)
    code: ErrorCode | None = None


_PARAM_KEYS = {
    ErrorCode.UPLOAD_TOO_LARGE: {"max_bytes"},
    ErrorCode.RATE_LIMITED_RETRY: {"retry_after"},
}


def error_body(detail: Any, code: ErrorCode, params: dict[str, int] | None = None) -> dict:
    """Also used by middleware responses outside FastAPI's exception layer."""
    if params and (
        not set(params).issubset(_PARAM_KEYS.get(code, set()))
        or any(type(value) is not int or value < 0 for value in params.values())
    ):
        raise ValueError("Unsupported interpolation parameters for error code")
    body = {"detail": detail, "code": code.value}
    if params:
        body["params"] = params
    return body


class ApiError(HTTPException):
    def __init__(
        self,
        status_code: int,
        detail: Any,
        *,
        code: ErrorCode,
        params: dict[str, int] | None = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.body = error_body(detail, code, params)


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder(exc.body),
        headers=exc.headers,
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Keep FastAPI's existing detail array, including field paths and constraints.
    response = await request_validation_exception_handler(request, exc)
    body = json.loads(response.body)
    body["code"] = ErrorCode.VALIDATION_ERROR.value
    return JSONResponse(status_code=response.status_code, content=body)
