import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisResult, AssistantConfig } from "../types.js";
import { renderHtml, renderMarkdown, renderTitle } from "./render.js";

function safeFilename(title: string): string {
  return title.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, 80) || "weekly-report";
}

/**
 * 相对输出目录按配置文件所在目录解析，保证守护进程无论从哪个 cwd 启动，
 * 产物都落在部署目录而不是启动目录。
 */
export function resolveOutputDir(config: AssistantConfig, baseDir?: string): string {
  if (path.isAbsolute(config.output.directory)) {
    return config.output.directory;
  }
  return path.resolve(baseDir ?? process.cwd(), config.output.directory);
}

export async function writeReports(
  config: AssistantConfig,
  analysis: AnalysisResult,
  now = new Date(),
  baseDir?: string,
): Promise<{ markdownPath?: string; htmlPath?: string }> {
  const outputDir = resolveOutputDir(config, baseDir);
  await mkdir(outputDir, { recursive: true });
  const stamp = now.toISOString().replaceAll(":", "").replaceAll(".", "").slice(0, 15);
  const base = `${safeFilename(renderTitle(config))}_${stamp}`;
  const result: { markdownPath?: string; htmlPath?: string } = {};

  if (config.output.format === "markdown" || config.output.format === "both") {
    const markdownPath = path.join(outputDir, `${base}.md`);
    await writeFile(markdownPath, renderMarkdown(config, analysis), "utf8");
    result.markdownPath = markdownPath;
  }

  if (config.output.format === "html" || config.output.format === "both") {
    const htmlPath = path.join(outputDir, `${base}.html`);
    await writeFile(htmlPath, renderHtml(config, analysis), "utf8");
    result.htmlPath = htmlPath;
  }

  return result;
}
