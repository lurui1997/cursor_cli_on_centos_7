"""FastAPI app: upload handwriting photos and generate action code."""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import get_settings
from .pipeline import HandwritingPipeline

PACKAGE_DIR = Path(__file__).resolve().parent
STATIC_DIR = PACKAGE_DIR / "static"
ROOT_STATIC = Path(__file__).resolve().parents[2] / "static"


class TextProcessRequest(BaseModel):
    text: str = Field(min_length=1)
    mode: str = "auto"


def _static_dir() -> Path:
    if (STATIC_DIR / "index.html").exists():
        return STATIC_DIR
    return ROOT_STATIC


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="墨迹成码 · Handwriting to Action",
        description="手写体照片 OCR → 关键内容 → 行动计划 → 可执行代码",
        version="0.1.0",
    )
    pipeline = HandwritingPipeline(settings)
    static = _static_dir()
    if static.exists():
        app.mount("/assets", StaticFiles(directory=static), name="assets")

    @app.get("/", response_class=HTMLResponse)
    async def index() -> HTMLResponse:
        index_path = static / "index.html"
        if not index_path.exists():
            raise HTTPException(status_code=404, detail="前端页面缺失")
        return HTMLResponse(index_path.read_text(encoding="utf-8"))

    @app.get("/health")
    async def health() -> dict:
        return {
            "ok": True,
            "openai_configured": bool(settings.openai_api_key),
            "default_mode": settings.default_mode,
        }

    @app.post("/api/process")
    async def process_image(
        file: UploadFile = File(...),
        mode: str = Form("auto"),
        hint: str = Form(""),
    ) -> dict:
        if mode not in {"auto", "openai", "demo"}:
            raise HTTPException(status_code=400, detail="mode 必须是 auto|openai|demo")

        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="上传文件为空")
        if len(data) > settings.max_image_bytes:
            raise HTTPException(status_code=400, detail="图片过大（上限 8MB）")

        mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "image/jpeg"
        if not mime.startswith("image/"):
            raise HTTPException(status_code=400, detail="请上传图片文件")

        try:
            result = await pipeline.run(
                data,
                mime_type=mime,
                mode=mode,
                hint=hint or None,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return result.model_dump()

    @app.post("/api/from-text")
    async def process_text(payload: TextProcessRequest) -> dict:
        if payload.mode not in {"auto", "openai", "demo"}:
            raise HTTPException(status_code=400, detail="mode 必须是 auto|openai|demo")
        try:
            result = await pipeline.run_text(payload.text, mode=payload.mode)
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return result.model_dump()

    @app.get("/favicon.ico")
    async def favicon() -> FileResponse:
        icon = static / "favicon.svg"
        if icon.exists():
            return FileResponse(icon, media_type="image/svg+xml")
        raise HTTPException(status_code=404)

    return app


app = create_app()


def serve() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "handwriting_to_action.api:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
