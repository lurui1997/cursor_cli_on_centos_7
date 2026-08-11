"""End-to-end handwriting → plan → code pipeline."""

from __future__ import annotations

import logging
from pathlib import Path

from .codegen import CodeGenerator
from .config import Settings, get_settings
from .extract import ContentExtractor
from .llm import LLMClient
from .models import PipelineResult
from .ocr import HandwritingOCR
from .planner import Planner

logger = logging.getLogger(__name__)


class HandwritingPipeline:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.llm = LLMClient(self.settings)
        self.ocr = HandwritingOCR(self.llm)
        self.extractor = ContentExtractor(self.llm)
        self.planner = Planner(self.llm)
        self.codegen = CodeGenerator()

    def resolve_mode(self, requested: str | None = None) -> tuple[str, bool]:
        """Return (mode_name, force_demo)."""
        mode = (requested or self.settings.default_mode or "auto").lower()
        if mode == "demo":
            return "demo", True
        if mode == "openai":
            if not self.llm.available:
                raise RuntimeError("mode=openai 需要设置 OPENAI_API_KEY")
            return "openai", False
        # auto
        if self.llm.available:
            return "openai", False
        return "demo", True

    async def run(
        self,
        image_bytes: bytes,
        *,
        mime_type: str = "image/jpeg",
        mode: str | None = None,
        hint: str | None = None,
        output_dir: Path | str | None = None,
    ) -> PipelineResult:
        mode_name, force_demo = self.resolve_mode(mode)
        ocr = await self.ocr.recognize(
            image_bytes,
            mime_type=mime_type,
            force_demo=force_demo,
            hint=hint,
        )
        extracted = await self.extractor.extract(
            ocr.raw_text,
            force_demo=force_demo,
            language_hint=ocr.language,
        )
        plan = await self.planner.plan(extracted, force_demo=force_demo)
        artifacts = self.codegen.generate(plan, extracted)

        if output_dir is not None:
            out = Path(output_dir)
            out.mkdir(parents=True, exist_ok=True)
            for artifact in artifacts:
                path = out / artifact.filename
                path.write_text(artifact.content, encoding="utf-8")
                if artifact.filename.endswith(".sh"):
                    path.chmod(path.stat().st_mode | 0o111)

        return PipelineResult(
            mode=mode_name,
            extracted=extracted,
            plan=plan,
            artifacts=artifacts,
            meta={
                "ocr_source": ocr.source,
                "ocr_confidence": ocr.confidence,
                "ocr_warnings": ocr.warnings,
                "mime_type": mime_type,
                "image_bytes": len(image_bytes),
            },
        )

    async def run_text(
        self,
        text: str,
        *,
        mode: str | None = None,
        output_dir: Path | str | None = None,
    ) -> PipelineResult:
        """Skip vision OCR and start from plain text (useful for CLI/tests)."""
        mode_name, force_demo = self.resolve_mode(mode)
        # Text-only still respects openai/demo for extract+plan stages.
        extracted = await self.extractor.extract(text, force_demo=force_demo)
        plan = await self.planner.plan(extracted, force_demo=force_demo)
        artifacts = self.codegen.generate(plan, extracted)

        if output_dir is not None:
            out = Path(output_dir)
            out.mkdir(parents=True, exist_ok=True)
            for artifact in artifacts:
                path = out / artifact.filename
                path.write_text(artifact.content, encoding="utf-8")
                if artifact.filename.endswith(".sh"):
                    path.chmod(path.stat().st_mode | 0o111)

        return PipelineResult(
            mode=mode_name,
            extracted=extracted,
            plan=plan,
            artifacts=artifacts,
            meta={"ocr_source": "text-input", "ocr_confidence": 1.0, "ocr_warnings": []},
        )
