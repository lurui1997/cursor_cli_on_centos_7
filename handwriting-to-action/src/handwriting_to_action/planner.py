"""Turn extracted content into an ordered action plan."""

from __future__ import annotations

import logging
import re

from .llm import LLMClient, LLMError
from .models import ActionPlan, ExtractedContent, PlanStep, Priority

logger = logging.getLogger(__name__)

PLAN_SYSTEM = """你是执行规划专家。根据结构化笔记内容，输出可落地的行动计划。
只输出 JSON：
{
  "title": "计划标题",
  "objective": "最终目标",
  "steps": [
    {
      "id": "S1",
      "title": "步骤标题",
      "rationale": "为什么做",
      "depends_on": [],
      "estimated_minutes": 30,
      "deliverable": "产出物"
    }
  ],
  "risks": ["风险"],
  "success_criteria": ["完成标准"]
}
步骤按依赖排序；id 使用 S1、S2...；depends_on 引用既有 id。
"""


class Planner:
    def __init__(self, llm: LLMClient | None = None) -> None:
        self.llm = llm or LLMClient()

    async def plan(
        self,
        content: ExtractedContent,
        *,
        force_demo: bool = False,
    ) -> ActionPlan:
        if force_demo or not self.llm.available:
            return heuristic_plan(content)

        payload = content.model_dump()
        try:
            data = await self.llm.chat_json(
                system=PLAN_SYSTEM,
                user=f"请基于以下内容制定计划：\n{payload}",
                model=self.llm.settings.openai_text_model,
            )
            return _from_llm_plan(data, content)
        except (LLMError, ValueError, TypeError, KeyError) as exc:
            logger.warning("LLM 规划失败，回退启发式：%s", exc)
            return heuristic_plan(content)


def _from_llm_plan(data: dict, content: ExtractedContent) -> ActionPlan:
    steps: list[PlanStep] = []
    for item in data.get("steps") or []:
        if not isinstance(item, dict):
            continue
        step_id = str(item.get("id") or f"S{len(steps) + 1}")
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        minutes = item.get("estimated_minutes")
        steps.append(
            PlanStep(
                id=step_id,
                title=title,
                rationale=str(item.get("rationale") or ""),
                depends_on=[str(d) for d in item.get("depends_on") or []],
                estimated_minutes=int(minutes) if minutes is not None else None,
                deliverable=str(item.get("deliverable") or ""),
            )
        )
    if not steps:
        return heuristic_plan(content)

    return ActionPlan(
        title=str(data.get("title") or content.summary or "行动计划"),
        objective=str(data.get("objective") or content.summary),
        steps=steps,
        risks=[str(r) for r in data.get("risks") or []],
        success_criteria=[str(s) for s in data.get("success_criteria") or content.goals],
    )


def heuristic_plan(content: ExtractedContent) -> ActionPlan:
    ordered = sorted(
        content.tasks,
        key=lambda t: {Priority.HIGH: 0, Priority.MEDIUM: 1, Priority.LOW: 2}[t.priority],
    )
    steps: list[PlanStep] = []
    steps.append(
        PlanStep(
            id="S1",
            title="澄清范围与验收标准",
            rationale="先对齐目标，避免返工",
            estimated_minutes=20,
            deliverable="目标说明与验收清单",
        )
    )
    for index, task in enumerate(ordered, start=2):
        prev = f"S{index - 1}"
        minutes = 45 if task.priority == Priority.HIGH else 30
        steps.append(
            PlanStep(
                id=f"S{index}",
                title=task.title,
                rationale=task.description or "来自手写笔记任务项",
                depends_on=[prev],
                estimated_minutes=minutes,
                deliverable=f"完成：{task.title}",
            )
        )
    review_id = f"S{len(steps) + 1}"
    steps.append(
        PlanStep(
            id=review_id,
            title="复核结果并归档",
            rationale="确认产出可复用、可追踪",
            depends_on=[steps[-1].id] if steps else [],
            estimated_minutes=15,
            deliverable="复盘记录",
        )
    )

    objective = content.goals[0] if content.goals else content.summary
    title = _short_title(objective)
    return ActionPlan(
        title=title,
        objective=objective,
        steps=steps,
        risks=list(content.constraints) or ["手写识别可能存在歧义，执行前需人工确认"],
        success_criteria=content.goals
        or [f"完成全部 {len(content.tasks)} 项任务" if content.tasks else "完成计划步骤"],
    )


def _short_title(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= 24:
        return cleaned or "行动计划"
    return cleaned[:24] + "…"
