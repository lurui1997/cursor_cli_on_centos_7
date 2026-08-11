"""Extract key structured content from OCR text."""

from __future__ import annotations

import logging
import re

from .demo_data import DEMO_HANDWRITING_TEXT
from .llm import LLMClient, LLMError
from .models import ExtractedContent, Priority, TaskItem

logger = logging.getLogger(__name__)

EXTRACT_SYSTEM = """你是产品/工程助理。根据手写笔记 OCR 文本，提取可执行关键信息。
只输出 JSON：
{
  "summary": "一句话摘要",
  "goals": ["目标"],
  "tasks": [
    {
      "title": "任务标题",
      "description": "说明",
      "priority": "high|medium|low",
      "due": "截止日期或null",
      "tags": ["标签"]
    }
  ],
  "constraints": ["约束/限制"],
  "notes": ["其他备注"],
  "language": "zh|en"
}
不要编造原文没有依据的信息；可做轻度归纳。
"""


class ContentExtractor:
    def __init__(self, llm: LLMClient | None = None) -> None:
        self.llm = llm or LLMClient()

    async def extract(
        self,
        raw_text: str,
        *,
        force_demo: bool = False,
        language_hint: str = "zh",
    ) -> ExtractedContent:
        if force_demo or not self.llm.available:
            return heuristic_extract(raw_text.strip() or DEMO_HANDWRITING_TEXT)

        try:
            data = await self.llm.chat_json(
                system=EXTRACT_SYSTEM,
                user=f"OCR 文本如下：\n\n{raw_text}",
                model=self.llm.settings.openai_text_model,
            )
            return _from_llm_payload(data, raw_text=raw_text, fallback_lang=language_hint)
        except (LLMError, ValueError, TypeError, KeyError) as exc:
            logger.warning("LLM 提取失败，回退启发式：%s", exc)
            return heuristic_extract(raw_text, language=language_hint)


def _from_llm_payload(
    data: dict,
    *,
    raw_text: str,
    fallback_lang: str,
) -> ExtractedContent:
    tasks: list[TaskItem] = []
    for item in data.get("tasks") or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        priority_raw = str(item.get("priority") or "medium").lower()
        try:
            priority = Priority(priority_raw)
        except ValueError:
            priority = Priority.MEDIUM
        tasks.append(
            TaskItem(
                title=title,
                description=str(item.get("description") or ""),
                priority=priority,
                due=item.get("due"),
                tags=[str(t) for t in item.get("tags") or []],
            )
        )

    return ExtractedContent(
        raw_text=raw_text,
        summary=str(data.get("summary") or raw_text[:120]),
        goals=[str(g) for g in data.get("goals") or []],
        tasks=tasks,
        constraints=[str(c) for c in data.get("constraints") or []],
        notes=[str(n) for n in data.get("notes") or []],
        language=str(data.get("language") or fallback_lang),
    )


_BULLET = re.compile(
    r"^\s*(?:[-*•·]|[\d]+[\.\)、]|[（(]?[一二三四五六七八九十]+[)）、.])\s*(.+)$"
)
_PRIORITY = re.compile(r"(紧急|重要|高优|asap|urgent|high)", re.I)
_LOW = re.compile(r"(稍后|低优|可选|low|later)", re.I)


def heuristic_extract(raw_text: str, *, language: str = "zh") -> ExtractedContent:
    """Rule-based extractor used when LLM is unavailable."""
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    tasks: list[TaskItem] = []
    goals: list[str] = []
    notes: list[str] = []
    constraints: list[str] = []

    for line in lines:
        bullet = _BULLET.match(line)
        content = bullet.group(1).strip() if bullet else line
        lower = content.lower()

        if re.match(r"^(目标|目的|goal|objective)\b", content, flags=re.I):
            goals.append(re.sub(r"^(目标|目的|goal|objective)[:：\s]*", "", content, flags=re.I))
            continue
        if re.match(r"^(注意|约束|限制|constraint)\b", content, flags=re.I):
            constraints.append(content)
            continue
        # Skip bare section headers like "待办：" / "Tasks:"
        if re.fullmatch(r"(待办|任务|todo|tasks|notes?)[:：]?", content, flags=re.I):
            continue

        if bullet or any(k in lower for k in ("todo", "待办", "任务", "做", "实现", "完成")):
            if _PRIORITY.search(content):
                priority = Priority.HIGH
            elif _LOW.search(content):
                priority = Priority.LOW
            else:
                priority = Priority.MEDIUM
            tasks.append(TaskItem(title=content[:120], description=content, priority=priority))
        else:
            notes.append(content)

    if not tasks and lines:
        for line in lines[:8]:
            tasks.append(TaskItem(title=line[:120], description=line, priority=Priority.MEDIUM))

    summary = goals[0] if goals else (tasks[0].title if tasks else (lines[0] if lines else "空笔记"))
    return ExtractedContent(
        raw_text=raw_text,
        summary=summary,
        goals=goals,
        tasks=tasks,
        constraints=constraints,
        notes=notes,
        language=language,
    )
