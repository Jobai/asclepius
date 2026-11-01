"""Pin the additive error contract and the real producers used by the UI."""

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel

from asclepius.api_errors import ApiError, ErrorCode, error_body


@pytest.mark.parametrize("mode", ["core", "share"])
async def test_error_handlers_preserve_legacy_contract(app, monkeypatch, mode):
    from asclepius.main import create_app

    monkeypatch.setenv("ASCLEPIUS_MODE", mode)
    application = create_app()
    detail = {"message": "legacy detail", "existing_document_id": 17, "status": "busy"}

    @application.get("/api/share/test-coded-error")
    def coded():
        raise ApiError(
            429,
            detail,
            code=ErrorCode.RATE_LIMITED_RETRY,
            params={"retry_after": 23},
            headers={"Retry-After": "23", "X-Share-Session": "ended"},
        )

    @application.get("/api/share/test-legacy-error")
    def legacy():
        raise HTTPException(409, detail=detail, headers={"X-Legacy": "kept"})

    class Input(BaseModel):
        code: int

    @application.post("/api/share/test-validation")
    def validated(body: Input):
        return body

    schema = application.openapi()
    validation_schema = schema["components"]["schemas"]["HTTPValidationError"]
    assert validation_schema["properties"]["detail"]["type"] == "array"
    assert "code" in validation_schema["properties"]
    assert "422" in schema["paths"]["/api/share/test-validation"]["post"]["responses"]

    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://test") as c:
        response = await c.get("/api/share/test-coded-error")
        assert response.status_code == 429
        assert response.headers["retry-after"] == "23"
        assert response.headers["x-share-session"] == "ended"
        assert response.json() == {
            "detail": detail,
            "code": "rate_limited_retry",
            "params": {"retry_after": 23},
        }
        legacy_response = await c.get("/api/share/test-legacy-error")
        assert legacy_response.status_code == 409
        assert legacy_response.json() == {"detail": detail}
        assert legacy_response.headers["x-legacy"] == "kept"
        invalid = await c.post("/api/share/test-validation", json={"code": "invalid"})
        assert invalid.status_code == 422
        assert invalid.json()["code"] == "validation_error"
        assert invalid.json()["detail"] == [
            {
                "type": "int_parsing",
                "loc": ["body", "code"],
                "msg": "Input should be a valid integer, unable to parse string as an integer",
                "input": "invalid",
            }
        ]
        ended = await c.get("/api/share/me")
        assert ended.status_code == 410
        assert ended.headers["x-share-session"] == "ended"
        assert ended.json()["code"] == "share_session_ended"
        unknown = await c.post("/api/share/unknown/request-otp")
        assert unknown.status_code == 204
        assert unknown.content == b""


async def test_auth_codes_and_validation(unauthed_client, client):
    invalid = await unauthed_client.post(
        "/api/auth/login", json={"username": "admin", "password": "incorrect"}
    )
    assert invalid.status_code == 401
    assert invalid.json()["code"] == "invalid_credentials"
    assert isinstance(invalid.json()["detail"], str)
    required = await unauthed_client.get("/api/documents")
    assert required.status_code == 401
    assert required.json()["code"] == "authentication_required"
    missing = await client.get("/api/documents/999999")
    assert missing.status_code == 404
    assert missing.json()["code"] == "not_found"
    validation = await client.patch("/api/auth/me/preferences", json={"ui_language": "xx"})
    assert validation.status_code == 422
    assert validation.json()["code"] == "validation_error"
    assert validation.json()["detail"][0]["loc"] == ["body", "ui_language"]


async def test_upload_size_and_csrf_codes(client, monkeypatch):
    from asclepius.config import get_config

    monkeypatch.setattr(get_config().server, "max_upload_bytes", 4)
    response = await client.post(
        "/api/documents/upload", files={"file": ("sample.pdf", b"%PDF-1.4", "application/pdf")}
    )
    assert response.status_code == 413
    assert response.json() == {
        "detail": "Upload exceeds 4 bytes",
        "code": "upload_too_large",
        "params": {"max_bytes": 4},
    }
    # Middleware produces this error before routing to a handler.
    client.headers.pop("X-Requested-With")
    response = await client.post("/api/patients", json={"display_name": "Example"})
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


async def test_otp_cooldown_preserves_retry_header(unauthed_client, monkeypatch):
    from asclepius.share import public_routes as routes
    from asclepius.share.service import OtpCooldownError

    monkeypatch.setattr(
        routes.share_service,
        "get_share_by_token",
        AsyncMock(
            return_value={
                "id": 1,
                "token_hash": "hash",
                "otp_delivery": "email",
            }
        ),
    )
    monkeypatch.setattr(routes.share_service, "is_share_active", lambda share: True)
    monkeypatch.setattr(routes, "otp_request_allowed", lambda *args: True)
    monkeypatch.setattr(routes.share_service, "count_email_otps_today", AsyncMock(return_value=0))
    monkeypatch.setattr(
        routes.share_service, "issue_otp", AsyncMock(side_effect=OtpCooldownError(19))
    )
    response = await unauthed_client.post("/api/share/token/request-otp")
    assert response.status_code == 429
    assert response.headers["retry-after"] == "19"
    assert response.json() == {
        "detail": "Please wait before requesting another code.",
        "code": "rate_limited_retry",
        "params": {"retry_after": 19},
    }


@pytest.mark.parametrize(
    "params", [{"detail": 3}, {"retry_after": -1}, {"retry_after": True}, {"retry_after": "19"}]
)
def test_only_allowlisted_numeric_params_are_accepted(params):
    with pytest.raises(ValueError):
        error_body("legacy detail", ErrorCode.RATE_LIMITED_RETRY, params)
