"""CLI entrypoint: hta."""

from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import sys
from pathlib import Path

from .pipeline import HandwritingPipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hta",
        description="手写体照片 → OCR → 计划 → 行动代码",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="处理一张手写照片并生成行动代码")
    run.add_argument("image", type=Path, help="手写照片路径")
    run.add_argument("-o", "--output", type=Path, default=Path("hta-output"), help="输出目录")
    run.add_argument(
        "--mode",
        choices=["auto", "openai", "demo"],
        default="auto",
        help="运行模式（默认 auto：有 API Key 用 openai，否则 demo）",
    )
    run.add_argument("--hint", default=None, help="可选上下文提示，或在 demo 下作为模拟 OCR 文本")
    run.add_argument("--json", action="store_true", help="将完整结果打印为 JSON")

    text = sub.add_parser("from-text", help="跳过 OCR，直接从文本生成计划与代码")
    text.add_argument("text_file", type=Path, nargs="?", help="文本文件；省略则读 stdin")
    text.add_argument("-o", "--output", type=Path, default=Path("hta-output"))
    text.add_argument("--mode", choices=["auto", "openai", "demo"], default="auto")
    text.add_argument("--json", action="store_true")

    sub.add_parser("serve", help="启动 Web UI / API")
    return parser


async def _cmd_run(args: argparse.Namespace) -> int:
    image_path: Path = args.image
    if not image_path.exists():
        print(f"找不到图片: {image_path}", file=sys.stderr)
        return 1
    image_bytes = image_path.read_bytes()
    mime, _ = mimetypes.guess_type(str(image_path))
    mime_type = mime or "image/jpeg"

    pipeline = HandwritingPipeline()
    result = await pipeline.run(
        image_bytes,
        mime_type=mime_type,
        mode=args.mode,
        hint=args.hint,
        output_dir=args.output,
    )
    _print_result(result, as_json=args.json, output=args.output)
    return 0


async def _cmd_from_text(args: argparse.Namespace) -> int:
    if args.text_file:
        text = args.text_file.read_text(encoding="utf-8")
    else:
        text = sys.stdin.read()
    if not text.strip():
        print("输入文本为空", file=sys.stderr)
        return 1

    pipeline = HandwritingPipeline()
    result = await pipeline.run_text(text, mode=args.mode, output_dir=args.output)
    _print_result(result, as_json=args.json, output=args.output)
    return 0


def _print_result(result, *, as_json: bool, output: Path) -> None:
    if as_json:
        print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
        return
    print(f"模式: {result.mode}")
    print(f"摘要: {result.extracted.summary}")
    print(f"任务数: {len(result.extracted.tasks)}")
    print(f"计划: {result.plan.title}（{len(result.plan.steps)} 步）")
    print(f"输出目录: {output.resolve()}")
    for artifact in result.artifacts:
        print(f"  - {artifact.filename} ({artifact.language}) — {artifact.description}")


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "serve":
        from .api import serve

        serve()
        return

    if args.command == "run":
        raise SystemExit(asyncio.run(_cmd_run(args)))
    if args.command == "from-text":
        raise SystemExit(asyncio.run(_cmd_from_text(args)))

    parser.error(f"未知命令: {args.command}")


if __name__ == "__main__":
    main()
