import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultConfig } from "../src/config/defaults.js";
import { authorizeSource } from "../src/config/store.js";
import { normalizeMaterials, aggregateUnifiedMetrics } from "../src/pipeline/normalize.js";
import { analyze, evaluateQuality, buildNextSteps } from "../src/pipeline/analyze.js";
import { runPipeline } from "../src/pipeline/run.js";
import { renderMarkdown, renderHtml } from "../src/report/render.js";
import type { RawMaterial } from "../src/types.js";

test("未授权数据源不会被采集", async () => {
  const config = createDefaultConfig({
    workspaceName: "auth-test",
    period: { start: "2026-08-04", end: "2026-08-10" },
  });
  // custom 默认已授权；关掉它，只留未授权 git
  config.sources = config.sources.map((s) =>
    s.kind === "custom"
      ? { ...s, enabled: false, auth: { authorized: false } }
      : s.kind === "git"
        ? { ...s, enabled: true, auth: { authorized: false } }
        : { ...s, enabled: false },
  );

  const report = await runPipeline(config, { write: false });
  assert.equal(report.analysis.materials.length, 0);
  assert.ok(report.analysis.qualityIssues.some((i) => i.code === "UNAUTHORIZED_SOURCE"));
});

test("指标别名会归一到统一口径 key", () => {
  const config = createDefaultConfig();
  const materials: RawMaterial[] = [
    {
      id: "m1",
      sourceId: "src-git",
      sourceKind: "git",
      collectedAt: new Date().toISOString(),
      title: "feat: x",
      summary: "提交",
      raw: { metricHints: { 提交次数: 2, commit_count: 2 } },
      tags: ["git"],
    },
  ];
  const { evidence, issues } = normalizeMaterials(materials, config);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]?.metrics.length, 1);
  assert.equal(evidence[0]?.metrics[0]?.key, "commits");
  assert.equal(evidence[0]?.metrics[0]?.unified, true);
  assert.equal(issues.filter((i) => i.code === "METRIC_INCONSISTENT").length, 0);

  const aggregated = aggregateUnifiedMetrics(evidence, config.metrics);
  assert.equal(aggregated.find((m) => m.key === "commits")?.value, 2);
});

test("流水账材料会被升维并标记质量警告", () => {
  const config = createDefaultConfig();
  const materials: RawMaterial[] = [
    {
      id: "m-chronicle",
      sourceId: "src-custom",
      sourceKind: "custom",
      collectedAt: new Date().toISOString(),
      title: "日常",
      summary: "今天做了联调",
      raw: { note: "今天做了联调" },
      tags: ["custom"],
    },
  ];
  const { evidence, issues } = normalizeMaterials(materials, config);
  assert.ok(issues.some((i) => i.code === "CHRONICLE_ONLY"));
  assert.ok(evidence[0]?.outcome.includes("工作证据") || evidence[0]?.outcome.length > 0);
  assert.ok(evidence[0]?.value.length > 0);
  assert.ok(evidence[0]?.risks.length > 0);
});

test("下一步计划必须可执行，笼统计划会被质量检查拦截", () => {
  const config = createDefaultConfig();
  config.goals[0]!.owner = "";
  const evidence = normalizeMaterials(
    [
      {
        id: "m2",
        sourceId: "src-custom",
        sourceKind: "custom",
        collectedAt: new Date().toISOString(),
        title: "交付",
        summary: "完成模块",
        raw: {
          action: "完成模块",
          outcome: "模块可演示",
          value: "解锁联调",
          risks: ["缺测试"],
        },
        tags: ["custom"],
      },
    ],
    config,
  ).evidence;

  // 人为构造笼统下一步
  const vague = [
    {
      id: "next-vague",
      title: "继续推进",
      owner: "",
      dueDate: "",
      definitionOfDone: "跟进一下",
      relatedGoalIds: ["goal-delivery"],
      relatedEvidenceIds: [],
    },
  ];
  const issues = evaluateQuality(evidence, vague, config);
  assert.ok(issues.some((i) => i.code === "VAGUE_NEXT_STEP"));

  // 占位符负责人同样视为不可执行，避免「负责人待指定」蒙混过关
  const placeholderOwner = [
    {
      id: "next-placeholder",
      title: "围绕「关键交付推进」完成可验收交付",
      owner: "负责人待指定",
      dueDate: "2026-08-15",
      definitionOfDone: "满足：有可演示或可合并的交付物，并完成回归验证。",
      relatedGoalIds: ["goal-delivery"],
      relatedEvidenceIds: [],
    },
  ];
  const ownerIssues = evaluateQuality(evidence, placeholderOwner, config);
  const ownerIssue = ownerIssues.find((i) => i.code === "VAGUE_NEXT_STEP");
  assert.ok(ownerIssue);
  assert.match(ownerIssue!.message, /负责人/);

  const proper = buildNextSteps(evidence, {
    ...config,
    goals: config.goals.map((g) => ({ ...g, owner: g.owner || "负责人A" })),
  });
  const okIssues = evaluateQuality(evidence, proper, {
    ...config,
    goals: config.goals.map((g) => ({ ...g, owner: g.owner || "负责人A" })),
  });
  assert.equal(okIssues.filter((i) => i.code === "VAGUE_NEXT_STEP").length, 0);
});

test("相对输出目录按 baseDir 解析，不受进程 cwd 影响", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "weekly-basedir-"));
  const originalCwd = process.cwd();
  try {
    const config = createDefaultConfig({
      workspaceName: "BaseDir",
      period: { start: "2026-08-01", end: "2026-08-12" },
      output: {
        format: "markdown",
        directory: "./output",
        titleTemplate: "{{workspace}} 周报 {{start}} ~ {{end}}",
      },
    });
    config.sources = config.sources.map((s) =>
      s.id === "src-custom"
        ? { ...s, options: { notes: ["部署校验"], structuredNotes: [] } }
        : { ...s, enabled: false },
    );

    process.chdir(os.tmpdir());
    const report = await runPipeline(config, { write: true, baseDir: dir });

    assert.ok(report.markdownPath);
    assert.equal(path.dirname(path.resolve(report.markdownPath!)), path.join(dir, "output"));
    await readFile(report.markdownPath!, "utf8");
  } finally {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("授权后可端到端生成 markdown 与 html", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "weekly-asst-"));
  try {
    let config = createDefaultConfig({
      workspaceName: "E2E",
      period: { start: "2020-01-01", end: "2099-12-31" },
      output: {
        format: "both",
        directory: path.join(dir, "out"),
        titleTemplate: "{{workspace}} 周报 {{start}} ~ {{end}}",
      },
    });
    config = authorizeSource(config, "src-git", "tester", "本地 git");
    config.sources = config.sources.map((s) => {
      if (s.id !== "src-custom") {
        return s.id === "src-git"
          ? { ...s, options: { ...s.options, repoPath: path.resolve("..") } }
          : { ...s, enabled: s.id === "src-custom" };
      }
      return {
        ...s,
        options: {
          notes: [],
          structuredNotes: [
            {
              title: "口径表",
              action: "整理指标别名",
              outcome: "形成统一口径表",
              value: "周报数据可对齐",
              risks: ["别名遗漏"],
            },
          ],
        },
      };
    });

    // 再补两条证据以满足 minOutcomeItems（git 可能为空仓库历史）
    const historyFile = path.join(dir, "history.json");
    await writeFile(historyFile, "[]", "utf8");

    const report = await runPipeline(config, { write: true });
    assert.ok(report.markdownPath);
    assert.ok(report.htmlPath);
    const md = await readFile(report.markdownPath!, "utf8");
    const html = await readFile(report.htmlPath!, "utf8");
    assert.match(md, /成果与价值/);
    assert.match(md, /下一步计划/);
    assert.match(html, /统一口径数据/);

    const analysis = analyze(report.analysis.materials, report.analysis.evidence, config, []);
    const renderedMd = renderMarkdown(config, analysis);
    const renderedHtml = renderHtml(config, analysis);
    assert.match(renderedMd, /分析结论/);
    assert.match(renderedHtml, /<!DOCTYPE html>/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
