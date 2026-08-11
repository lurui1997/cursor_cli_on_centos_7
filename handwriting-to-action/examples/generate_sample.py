#!/usr/bin/env python3
"""Generate a sample action pack from examples/sprint-note.txt."""

from __future__ import annotations

import asyncio
from pathlib import Path

from handwriting_to_action.pipeline import HandwritingPipeline

ROOT = Path(__file__).resolve().parents[1]
NOTE = ROOT / "examples" / "sprint-note.txt"
OUT = ROOT / "samples" / "generated"


async def main() -> None:
    text = NOTE.read_text(encoding="utf-8")
    result = await HandwritingPipeline().run_text(text, mode="demo", output_dir=OUT)
    print(f"wrote {len(result.artifacts)} files to {OUT}")
    for artifact in result.artifacts:
        print(f" - {artifact.filename}")


if __name__ == "__main__":
    asyncio.run(main())
