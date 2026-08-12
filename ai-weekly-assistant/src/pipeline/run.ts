import type { AnalysisResult, AssistantConfig, GeneratedReport, ReportFormat } from "../types.js";
import { collectMaterials } from "./collect.js";
import { normalizeMaterials } from "./normalize.js";
import { analyze } from "./analyze.js";
import { writeReports } from "../report/writer.js";

export async function runPipeline(
  config: AssistantConfig,
  options?: { now?: Date; write?: boolean; baseDir?: string },
): Promise<GeneratedReport> {
  const now = options?.now ?? new Date();
  const baseDir = options?.baseDir ?? process.cwd();
  const { materials, skipped } = await collectMaterials(config, now, baseDir);
  const { evidence, issues } = normalizeMaterials(materials, config);
  const analysis = analyze(materials, evidence, config, [...skipped, ...issues]);

  let markdownPath: string | undefined;
  let htmlPath: string | undefined;
  const format: ReportFormat = config.output.format;

  if (options?.write !== false) {
    const written = await writeReports(config, analysis, now, baseDir);
    markdownPath = written.markdownPath;
    htmlPath = written.htmlPath;
  }

  return {
    format,
    markdownPath,
    htmlPath,
    analysis,
    generatedAt: now.toISOString(),
  };
}
