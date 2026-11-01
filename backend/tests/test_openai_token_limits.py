"""Regression coverage for GPT-5/6 rejecting max_tokens in chat completions."""

import json

import httpx
import pytest

from asclepius.llm.openai_provider import OpenAIProvider
from asclepius.pipeline.vision_io import call_vision


MODEL_LIMIT_PARAMETERS = [
    ("gpt-6.1-terra", "max_completion_tokens"),
    ("gpt-6", "max_completion_tokens"),
    ("gpt-5-mini", "max_completion_tokens"),
    ("gpt-4o", "max_tokens"),
    ("local-model", "max_tokens"),
]


@pytest.fixture
def openai_requests(monkeypatch):
    """Exercise real HTTP request serialization without contacting a provider."""
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    client_class = httpx.AsyncClient
    transport = httpx.MockTransport(respond)
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kwargs: client_class(transport=transport, **kwargs)
    )
    monkeypatch.setattr("asclepius.llm.base.get_output_token_caps", lambda: (2048, 1024))
    monkeypatch.setattr("asclepius.llm.openai_provider.get_output_token_caps", lambda: (2048, 1024))
    return requests


def assert_request(requests, model, parameter, limit):
    assert len(requests) == 1
    request = requests[0]
    assert str(request.url) == "https://provider.example/v1/chat/completions"
    assert request.headers["Authorization"] == "Bearer test-key"
    body = json.loads(request.content)
    assert body["model"] == model
    assert {key: value for key, value in body.items() if key.startswith("max_")} == {
        parameter: limit
    }
    return body


@pytest.mark.parametrize("model,parameter", MODEL_LIMIT_PARAMETERS)
async def test_extraction_token_limit(openai_requests, model, parameter):
    provider = OpenAIProvider(
        api_key="test-key", model=model, base_url="https://provider.example/v1"
    )

    result = await provider.extract("Synthetic OCR text", {})

    assert result == {"ok": True}
    body = assert_request(openai_requests, model, parameter, 2048)
    assert body["response_format"] == {"type": "json_object"}
    assert "Synthetic OCR text" in body["messages"][0]["content"]


@pytest.mark.parametrize("model,parameter", MODEL_LIMIT_PARAMETERS)
async def test_chat_token_limit(openai_requests, model, parameter):
    provider = OpenAIProvider(
        api_key="test-key", model=model, base_url="https://provider.example/v1"
    )
    messages = [{"role": "user", "content": "Return JSON."}]

    result = await provider.chat(messages, "System instructions", json_mode=True)

    assert result == '{"ok": true}'
    body = assert_request(openai_requests, model, parameter, 2048)
    assert body["messages"] == [{"role": "system", "content": "System instructions"}, *messages]
    assert body["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize("model,parameter", MODEL_LIMIT_PARAMETERS)
async def test_vision_token_limit(openai_requests, model, parameter):
    result = await call_vision(
        provider_type="openai",
        model=model,
        api_key="test-key",
        base_url="https://provider.example/v1/",
        b64_image="synthetic-image",
        prompt="Read this image.",
        max_tokens=128,
    )

    assert result == '{"ok": true}'
    body = assert_request(openai_requests, model, parameter, 128)
    assert body["messages"] == [
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/jpeg;base64,synthetic-image"},
                },
                {"type": "text", "text": "Read this image."},
            ],
        }
    ]
