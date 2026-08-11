"""Handwriting OCR via vision models (or demo heuristics)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from .demo_data import DEMO_HANDWRITING_TEXT
from .llm import LLMClient, LLMError

logger = logging.getLogger(__name__)

OCR_SYSTEM = """你是手写体 OCR 与内容理解专家。
用户会提供手写笔记/白板/纸条的照片。
请尽量准确识别手写文字，保留原有条目结构。
只输出 JSON，字段：
{
  "raw_text": "完整识别文本",
  "confidence": 0.0到1.0,
  "language": "zh|en|mixed",
  "warnings": ["可选警告"]
}
若图中几乎无文字，raw_text 置空并在 warnings 说明。
"""


@dataclass
class OCRResult:
    raw_text: str
    confidence: float
    language: str
    warnings: list[str]
    source: str


class HandwritingOCR:
    def __init__(self, llm: LLMClient | None = None) -> None:
        self.llm = llm or LLMClient()

    async def recognize(
        self,
        image_bytes: bytes,
        *,
        mime_type: str = "image/jpeg",
        force_demo: bool = False,
        hint: str | None = None,
    ) -> OCRResult:
        if force_demo or not self.llm.available:
            return self._demo_ocr(hint=hint)

        try:
            user = "请识别这张手写体照片中的全部文字。"
            if hint:
                user += f"\n补充上下文：{hint}"
            data = await self.llm.chat_json(
                system=OCR_SYSTEM,
                user=user,
                model=self.llm.settings.openai_vision_model,
                image_bytes=image_bytes,
                mime_type=mime_type,
                temperature=0.1,
            )
        except LLMError as exc:
            logger.warning("Vision OCR 失败，回退 demo：%s", exc)
            return self._demo_ocr(hint=hint, warning=str(exc))

        return OCRResult(
            raw_text=str(data.get("raw_text") or "").strip(),
            confidence=float(data.get("confidence") or 0.0),
            language=str(data.get("language") or "zh"),
            warnings=[str(w) for w in data.get("warnings") or []],
            source="openai",
        )

    def _demo_ocr(
        self,
        *,
        hint: str | None = None,
        warning: str | None = None,
    ) -> OCRResult:
        text = hint.strip() if hint and hint.strip() else DEMO_HANDWRITING_TEXT
        warnings = ["当前为 demo 模式：未调用真实视觉 OCR"]
        if warning:
            warnings.append(warning)
        return OCRResult(
            raw_text=text,
            confidence=0.55,
            language="zh",
            warnings=warnings,
            source="demo",
        )
