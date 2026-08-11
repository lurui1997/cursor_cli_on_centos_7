import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisResult, AssistantConfig } from "../types.js";
import { renderHtml, renderMarkdown, renderTitle } from "./render.js";

function safeFilename(title: string): string {
  return title.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, 80) || "weekly-report";
}

export async function writeReports(
  config: AssistantConfig,
  analysis: AnalysisResult,
  now = new Date(),
): Promise<{ markdownPath?: string; htmlPath?: string }> {
  await mkdir(config.output.directory, { recursive: true });
  const stamp = now.toISOString().replaceAll(":", "").replaceAll(".", "").slice(0, 15);
  const base = `${safeFilename(renderTitle(config))}_${stamp}`;
  const result: { markdownPath?: string; htmlPath?: string } = {};

  if (config.output.format === "markdown" || config.output.format === "both") {
    const markdownPath = path.join(config.output.directory, `${base}.md`);
    await writeFile(markdownPath, renderMarkdown(config, analysis), "utf8");
    result.markdownPath = markdownPath;
  }

  if (config.output.format === "html" || config.output.format === "both") {
    const htmlPath = path.join(config.output.directory, `${base}.html`);
    await writeFile(htmlPath, renderHtml(config, analysis), "utf8");
    result.htmlPath = htmlPath;
  }

  return result;
}
