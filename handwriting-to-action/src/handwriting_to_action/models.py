"""Shared domain models for the handwriting-to-action pipeline."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Priority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskItem(BaseModel):
    """A single actionable task extracted from handwriting."""

    title: str
    description: str = ""
    priority: Priority = Priority.MEDIUM
    due: str | None = None
    tags: list[str] = Field(default_factory=list)


class ExtractedContent(BaseModel):
    """Structured key content from OCR + understanding."""

    raw_text: str
    summary: str
    goals: list[str] = Field(default_factory=list)
    tasks: list[TaskItem] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    language: str = "zh"


class PlanStep(BaseModel):
    """One step in an executable action plan."""

    id: str
    title: str
    rationale: str = ""
    depends_on: list[str] = Field(default_factory=list)
    estimated_minutes: int | None = None
    deliverable: str = ""


class ActionPlan(BaseModel):
    """Ordered plan derived from extracted content."""

    title: str
    objective: str
    steps: list[PlanStep] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    success_criteria: list[str] = Field(default_factory=list)


class GeneratedArtifact(BaseModel):
    """A generated actionable code/script artifact."""

    filename: str
    language: str
    description: str
    content: str


class PipelineResult(BaseModel):
    """Full pipeline output."""

    mode: str
    extracted: ExtractedContent
    plan: ActionPlan
    artifacts: list[GeneratedArtifact] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
