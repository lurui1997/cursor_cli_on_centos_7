"""Generate actionable code artifacts from an action plan."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from .models import ActionPlan, ExtractedContent, GeneratedArtifact, Priority


def _py_literal(value: Any) -> str:
    """Serialize a JSON-compatible value as a Python literal."""
    raw = json.dumps(value, ensure_ascii=False, indent=2)
    raw = re.sub(r"\bnull\b", "None", raw)
    raw = re.sub(r"\btrue\b", "True", raw)
    raw = re.sub(r"\bfalse\b", "False", raw)
    return raw

_RUN_PLAN_TEMPLATE = '''\
#!/usr/bin/env python3
"""Auto-generated action runner for: {title}

Usage:
  python run_plan.py              # list steps
  python run_plan.py --start S1   # mark a step started
  python run_plan.py --done S1    # mark a step done
  python run_plan.py --status     # show progress
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

PLAN = {{
    "title": {title_json},
    "objective": {objective_json},
    "steps": {steps_json},
    "tasks": {tasks_json},
    "success_criteria": {success_json},
}}

STATE_FILE = Path(__file__).with_name(".plan_state.json")


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {{"done": [], "started": []}}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\\n",
        encoding="utf-8",
    )


def step_map() -> dict[str, dict]:
    return {{s["id"]: s for s in PLAN["steps"]}}


def list_steps(state: dict) -> None:
    print(f"# {{PLAN['title']}}")
    print(f"目标: {{PLAN['objective']}}")
    print()
    done = set(state.get("done", []))
    started = set(state.get("started", []))
    for step in PLAN["steps"]:
        sid = step["id"]
        if sid in done:
            mark = "[x]"
        elif sid in started:
            mark = "[~]"
        else:
            mark = "[ ]"
        deps = ",".join(step.get("depends_on") or []) or "-"
        print(f"{{mark}} {{sid}} {{step['title']}} (deps: {{deps}})")


def ensure_deps(sid: str, state: dict) -> None:
    step = step_map()[sid]
    missing = [d for d in step.get("depends_on") or [] if d not in state.get("done", [])]
    if missing:
        raise SystemExit(f"依赖未完成: {{', '.join(missing)}}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Execute generated action plan")
    parser.add_argument("--start", metavar="STEP_ID")
    parser.add_argument("--done", metavar="STEP_ID")
    parser.add_argument("--status", action="store_true")
    args = parser.parse_args()
    state = load_state()
    steps = step_map()

    if args.start:
        if args.start not in steps:
            raise SystemExit(f"未知步骤: {{args.start}}")
        ensure_deps(args.start, state)
        if args.start not in state["started"]:
            state["started"].append(args.start)
        save_state(state)
        print(f"已开始 {{args.start}}: {{steps[args.start]['title']}}")
        return

    if args.done:
        if args.done not in steps:
            raise SystemExit(f"未知步骤: {{args.done}}")
        ensure_deps(args.done, state)
        if args.done not in state["done"]:
            state["done"].append(args.done)
        save_state(state)
        print(f"已完成 {{args.done}}: {{steps[args.done]['title']}}")
        deliverable = steps[args.done].get("deliverable")
        if deliverable:
            print(f"期望产出: {{deliverable}}")
        return

    list_steps(state)
    if args.status:
        total = len(PLAN["steps"])
        done_n = len(state.get("done", []))
        print()
        print(f"进度: {{done_n}}/{{total}}")


if __name__ == "__main__":
    main()
'''


class CodeGenerator:
    """Produces scripts people (or agents) can actually run."""

    def generate(
        self,
        plan: ActionPlan,
        content: ExtractedContent,
    ) -> list[GeneratedArtifact]:
        return [
            self._checklist_markdown(plan, content),
            self._python_runner(plan, content),
            self._shell_bootstrap(plan),
            self._json_manifest(plan, content),
        ]

    def _checklist_markdown(
        self,
        plan: ActionPlan,
        content: ExtractedContent,
    ) -> GeneratedArtifact:
        lines = [
            f"# {plan.title}",
            "",
            f"> 目标：{plan.objective}",
            "",
            "## 步骤",
            "",
        ]
        for step in plan.steps:
            deps = f" (依赖: {', '.join(step.depends_on)})" if step.depends_on else ""
            eta = f" · ~{step.estimated_minutes}min" if step.estimated_minutes else ""
            lines.append(f"- [ ] **{step.id}** {step.title}{deps}{eta}")
            if step.rationale:
                lines.append(f"  - 原因：{step.rationale}")
            if step.deliverable:
                lines.append(f"  - 产出：{step.deliverable}")
        if plan.success_criteria:
            lines.extend(["", "## 成功标准", ""])
            lines.extend(f"- {c}" for c in plan.success_criteria)
        if plan.risks:
            lines.extend(["", "## 风险", ""])
            lines.extend(f"- {r}" for r in plan.risks)
        if content.tasks:
            lines.extend(["", "## 原始任务", ""])
            for task in content.tasks:
                lines.append(f"- [{task.priority.value}] {task.title}")

        return GeneratedArtifact(
            filename="ACTION_PLAN.md",
            language="markdown",
            description="可勾选的行动清单",
            content="\n".join(lines).rstrip() + "\n",
        )

    def _python_runner(
        self,
        plan: ActionPlan,
        content: ExtractedContent,
    ) -> GeneratedArtifact:
        steps_literal = [
            {
                "id": s.id,
                "title": s.title,
                "depends_on": s.depends_on,
                "estimated_minutes": s.estimated_minutes,
                "deliverable": s.deliverable,
            }
            for s in plan.steps
        ]
        tasks_literal = [
            {
                "title": t.title,
                "priority": t.priority.value,
                "due": t.due,
                "tags": t.tags,
            }
            for t in content.tasks
        ]
        body = _RUN_PLAN_TEMPLATE.format(
            title=plan.title.replace('"""', "'''"),
            title_json=_py_literal(plan.title),
            objective_json=_py_literal(plan.objective),
            steps_json=_py_literal(steps_literal),
            tasks_json=_py_literal(tasks_literal),
            success_json=_py_literal(plan.success_criteria),
        )
        return GeneratedArtifact(
            filename="run_plan.py",
            language="python",
            description="可执行的计划进度脚本（含依赖检查）",
            content=body,
        )

    def _shell_bootstrap(self, plan: ActionPlan) -> GeneratedArtifact:
        lines = [
            "#!/usr/bin/env bash",
            f"# Bootstrap for: {plan.title}",
            "set -euo pipefail",
            "",
            'ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
            'cd "$ROOT"',
            "",
            f'echo "==> 行动计划: {plan.title}"',
            f'echo "目标: {plan.objective}"',
            "echo",
            'if [[ ! -f run_plan.py ]]; then',
            '  echo "缺少 run_plan.py" >&2',
            "  exit 1",
            "fi",
            "",
            "python3 run_plan.py --status",
            "echo",
            'echo "下一步: python3 run_plan.py --start S1"',
            "",
        ]
        return GeneratedArtifact(
            filename="bootstrap.sh",
            language="bash",
            description="一键查看计划状态的启动脚本",
            content="\n".join(lines),
        )

    def _json_manifest(
        self,
        plan: ActionPlan,
        content: ExtractedContent,
    ) -> GeneratedArtifact:
        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "plan": plan.model_dump(),
            "extracted": content.model_dump(),
            "priority_counts": {
                Priority.HIGH.value: sum(1 for t in content.tasks if t.priority == Priority.HIGH),
                Priority.MEDIUM.value: sum(
                    1 for t in content.tasks if t.priority == Priority.MEDIUM
                ),
                Priority.LOW.value: sum(1 for t in content.tasks if t.priority == Priority.LOW),
            },
        }
        return GeneratedArtifact(
            filename="manifest.json",
            language="json",
            description="机器可读的计划清单",
            content=json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        )
