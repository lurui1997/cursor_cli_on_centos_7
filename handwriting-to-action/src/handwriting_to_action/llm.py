"""OpenAI-compatible chat/vision client with demo fallback."""

from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

import httpx

from .config import Settings, get_settings

logger = logging.getLogger(__name__)


class LLMError(RuntimeError):
    """Raised when the remote LLM call fails."""


class LLMClient:
    """Thin wrapper around OpenAI-compatible chat completions."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    @property
    def available(self) -> bool:
        return bool(self.settings.openai_api_key)

    async def chat_json(
        self,
        *,
        system: str,
        user: str,
        model: str | None = None,
        image_bytes: bytes | None = None,
        mime_type: str = "image/jpeg",
        temperature: float = 0.2,
    ) -> dict[str, Any]:
        if not self.available:
            raise LLMError("未配置 OPENAI_API_KEY，无法调用远程模型")

        content: list[dict[str, Any]] = [{"type": "text", "text": user}]
        if image_bytes is not None:
            b64 = base64.b64encode(image_bytes).decode("ascii")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{b64}",
                        "detail": "high",
                    },
                }
            )

        payload = {
            "model": model or self.settings.openai_text_model,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
        }

        headers = {
            "Authorization": f"Bearer {self.settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.settings.openai_base_url.rstrip('/')}/chat/completions"

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code >= 400:
                raise LLMError(
                    f"LLM 请求失败 ({response.status_code}): {response.text[:500]}"
                )
            data = response.json()

        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(f"无法解析 LLM 响应: {data}") from exc

        return parse_json_object(text)


def parse_json_object(text: str) -> dict[str, Any]:
    """Parse a JSON object from model output, tolerating markdown fences."""
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            raise
        value = json.loads(cleaned[start : end + 1])
    if not isinstance(value, dict):
        raise LLMError("模型返回的 JSON 不是对象")
    return value
