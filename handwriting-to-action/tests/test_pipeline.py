"""Unit tests for heuristic pipeline stages (no network)."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from handwriting_to_action.api import create_app
from handwriting_to_action.codegen import CodeGenerator
from handwriting_to_action.demo_data import DEMO_HANDWRITING_TEXT
from handwriting_to_action.extract import heuristic_extract
from handwriting_to_action.pipeline import HandwritingPipeline
from handwriting_to_action.planner import heuristic_plan


def test_heuristic_extract_finds_tasks_and_goals():
    content = heuristic_extract(DEMO_HANDWRITING_TEXT)
    assert content.goals
    assert any("MVP" in g or "上线" in g for g in content.goals)
    assert len(content.tasks) >= 4
    assert any(t.priority.value == "high" for t in content.tasks)


def test_heuristic_plan_orders_and_adds_bookends():
    content = heuristic_extract(DEMO_HANDWRITING_TEXT)
    plan = heuristic_plan(content)
    assert plan.steps[0].id == "S1"
    assert plan.steps[-1].title.startswith("复核")
    assert len(plan.steps) >= 3


def test_codegen_python_is_valid_and_runnable(tmp_path: Path):
    content = heuristic_extract(DEMO_HANDWRITING_TEXT)
    plan = heuristic_plan(content)
    artifacts = CodeGenerator().generate(plan, content)
    by_name = {a.filename: a for a in artifacts}
    assert set(by_name) >= {"ACTION_PLAN.md", "run_plan.py", "bootstrap.sh", "manifest.json"}

    py = by_name["run_plan.py"].content
    ast.parse(py)
    script = tmp_path / "run_plan.py"
    script.write_text(py, encoding="utf-8")

    import subprocess
    import sys

    listed = subprocess.run(
        [sys.executable, str(script)],
        check=True,
        capture_output=True,
        text=True,
    )
    assert "S1" in listed.stdout

    started = subprocess.run(
        [sys.executable, str(script), "--start", "S1"],
        check=True,
        capture_output=True,
        text=True,
    )
    assert "已开始 S1" in started.stdout


@pytest.mark.asyncio
async def test_pipeline_demo_from_text(tmp_path: Path):
    pipeline = HandwritingPipeline()
    result = await pipeline.run_text(
        DEMO_HANDWRITING_TEXT,
        mode="demo",
        output_dir=tmp_path,
    )
    assert result.mode == "demo"
    assert (tmp_path / "run_plan.py").exists()
    assert result.plan.steps


@pytest.mark.asyncio
async def test_pipeline_demo_from_image_bytes(tmp_path: Path):
    # Tiny valid JPEG header-ish payload is fine; demo ignores pixels.
    pipeline = HandwritingPipeline()
    result = await pipeline.run(
        b"\xff\xd8\xff\xd9",
        mime_type="image/jpeg",
        mode="demo",
        output_dir=tmp_path,
    )
    assert result.meta["ocr_source"] == "demo"
    assert result.artifacts


def test_api_from_text_demo():
    client = TestClient(create_app())
    res = client.post("/api/from-text", json={"text": DEMO_HANDWRITING_TEXT, "mode": "demo"})
    assert res.status_code == 200
    data = res.json()
    assert data["mode"] == "demo"
    assert data["plan"]["steps"]
    assert data["artifacts"]


def test_health_endpoint():
    client = TestClient(create_app())
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_index_served():
    client = TestClient(create_app())
    res = client.get("/")
    assert res.status_code == 200
    assert "墨迹成码" in res.text
