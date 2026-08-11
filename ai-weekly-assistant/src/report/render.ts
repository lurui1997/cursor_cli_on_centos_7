import type { AnalysisResult, AssistantConfig } from "../types.js";
import { aggregateUnifiedMetrics } from "../pipeline/normalize.js";

export function renderTitle(config: AssistantConfig): string {
  return config.output.titleTemplate
    .replaceAll("{{workspace}}", config.workspaceName)
    .replaceAll("{{start}}", config.period.start)
    .replaceAll("{{end}}", config.period.end);
}

export function renderMarkdown(config: AssistantConfig, analysis: AnalysisResult): string {
  const title = renderTitle(config);
  const metrics = aggregateUnifiedMetrics(analysis.evidence, config.metrics);
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> 生成说明：本周报强调成果、价值与风险，避免流水账；指标均按预登记口径归一。`);
  lines.push("");

  lines.push(`## 本周目标对齐`);
  for (const goal of analysis.goals) {
    lines.push(`- **${goal.title}**（P${goal.priority}）：${goal.description}`);
    lines.push(`  - 成功标准：${goal.successCriteria.join("；")}`);
  }
  lines.push("");

  lines.push(`## 采集材料摘要`);
  lines.push(analysis.collectedSummary);
  lines.push("");
  for (const material of analysis.materials.slice(0, 50)) {
    lines.push(`- [${material.sourceKind}] ${material.title} — ${material.summary}`);
  }
  if (analysis.materials.length > 50) {
    lines.push(`- … 另有 ${analysis.materials.length - 50} 条材料已纳入分析`);
  }
  lines.push("");

  lines.push(`## 成果与价值`);
  for (const item of analysis.evidence) {
    lines.push(`### ${item.title}`);
    lines.push(`- 动作：${item.action}`);
    lines.push(`- 成果：${item.outcome}`);
    lines.push(`- 价值：${item.value}`);
    if (item.risks.length) {
      lines.push(`- 风险：${item.risks.join("；")}`);
    }
    lines.push("");
  }

  lines.push(`## 风险与阻塞`);
  if (!analysis.risks.length) {
    lines.push(`- 暂无汇总风险（仍建议复查证据条目）`);
  } else {
    for (const risk of analysis.risks) {
      lines.push(`- ${risk}`);
    }
  }
  lines.push("");

  lines.push(`## 统一口径数据`);
  if (!metrics.length) {
    lines.push(`- 本周无可用统一口径指标`);
  } else {
    for (const metric of metrics) {
      lines.push(`- **${metric.displayName}**：${metric.value}${metric.unit}`);
      lines.push(`  - 口径：${metric.definition}`);
    }
  }
  lines.push("");

  lines.push(`## 分析结论`);
  for (const conclusion of analysis.conclusions) {
    lines.push(`- ${conclusion}`);
  }
  lines.push("");

  lines.push(`## 下一步计划`);
  for (const step of analysis.nextSteps) {
    lines.push(`- **${step.title}**`);
    lines.push(`  - 负责人：${step.owner}`);
    lines.push(`  - 截止日期：${step.dueDate}`);
    lines.push(`  - 完成定义：${step.definitionOfDone}`);
  }
  lines.push("");

  if (analysis.qualityIssues.length) {
    lines.push(`## 质量检查`);
    for (const issue of analysis.qualityIssues) {
      lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderHtml(config: AssistantConfig, analysis: AnalysisResult): string {
  const title = renderTitle(config);
  const metrics = aggregateUnifiedMetrics(analysis.evidence, config.metrics);

  const goalHtml = analysis.goals
    .map(
      (goal) => `
      <li>
        <strong>${escapeHtml(goal.title)}</strong>（P${goal.priority}）
        <div class="muted">${escapeHtml(goal.description)}</div>
        <div class="muted">成功标准：${escapeHtml(goal.successCriteria.join("；"))}</div>
      </li>`,
    )
    .join("");

  const materialsHtml = analysis.materials
    .slice(0, 50)
    .map(
      (m) =>
        `<li><span class="tag">${escapeHtml(m.sourceKind)}</span> ${escapeHtml(m.title)} — ${escapeHtml(m.summary)}</li>`,
    )
    .join("");

  const evidenceHtml = analysis.evidence
    .map(
      (item) => `
      <article class="evidence">
        <h3>${escapeHtml(item.title)}</h3>
        <ul>
          <li><strong>动作</strong>：${escapeHtml(item.action)}</li>
          <li><strong>成果</strong>：${escapeHtml(item.outcome)}</li>
          <li><strong>价值</strong>：${escapeHtml(item.value)}</li>
          <li><strong>风险</strong>：${escapeHtml(item.risks.join("；"))}</li>
        </ul>
      </article>`,
    )
    .join("");

  const metricsHtml = metrics.length
    ? metrics
        .map(
          (m) =>
            `<li><strong>${escapeHtml(m.displayName)}</strong>：${m.value}${escapeHtml(m.unit)}<div class="muted">口径：${escapeHtml(m.definition)}</div></li>`,
        )
        .join("")
    : "<li>本周无可用统一口径指标</li>";

  const nextHtml = analysis.nextSteps
    .map(
      (step) => `
      <li>
        <strong>${escapeHtml(step.title)}</strong>
        <div>负责人：${escapeHtml(step.owner)} ｜ 截止：${escapeHtml(step.dueDate)}</div>
        <div class="muted">完成定义：${escapeHtml(step.definitionOfDone)}</div>
      </li>`,
    )
    .join("");

  const qualityHtml = analysis.qualityIssues
    .map((issue) => `<li>[${issue.severity}] ${escapeHtml(issue.code)}: ${escapeHtml(issue.message)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --ink: #10233f;
      --accent: #1f7a8c;
      --wash: #e8f2f5;
      --panel: #ffffff;
      --line: rgba(16, 35, 63, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "Space Grotesk", "Noto Sans SC", sans-serif;
      background-color: #f5fafc;
      background-image:
        linear-gradient(135deg, rgba(31, 122, 140, 0.08) 0%, transparent 42%),
        linear-gradient(0deg, transparent 24px, rgba(16, 35, 63, 0.04) 25px),
        linear-gradient(90deg, transparent 24px, rgba(16, 35, 63, 0.04) 25px);
      background-size: auto, 26px 26px, 26px 26px;
      min-height: 100vh;
    }
    main {
      width: min(920px, calc(100% - 2rem));
      margin: 0 auto;
      padding: 2.5rem 0 4rem;
      animation: rise 0.55s ease-out both;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    h1 {
      font-family: "Space Grotesk", "Noto Sans SC", sans-serif;
      font-weight: 700;
      letter-spacing: -0.02em;
      font-size: clamp(1.8rem, 4vw, 2.5rem);
      line-height: 1.2;
      margin: 0 0 0.5rem;
    }
    h2 {
      margin-top: 2rem;
      border-left: 4px solid var(--accent);
      padding-left: 0.65rem;
      color: var(--ink);
      animation: rise 0.6s ease-out both;
    }
    .lead {
      color: rgba(16, 35, 63, 0.72);
      margin-bottom: 1.5rem;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      padding: 1rem 1.2rem;
    }
    .tag {
      display: inline-block;
      font-size: 0.75rem;
      padding: 0.1rem 0.45rem;
      border: 1px solid var(--line);
      margin-right: 0.35rem;
      background: var(--wash);
    }
    .muted { color: rgba(16, 35, 63, 0.68); font-size: 0.92rem; margin-top: 0.2rem; }
    .evidence { margin: 0.8rem 0; padding: 0.8rem 0; border-bottom: 1px dashed var(--line); }
    .evidence:last-child { border-bottom: 0; }
    ul { padding-left: 1.1rem; }
    li { margin: 0.35rem 0; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="lead">强调成果、价值与风险；材料已授权采集；指标按统一口径汇总。</p>

    <section class="panel">
      <h2>本周目标对齐</h2>
      <ul>${goalHtml}</ul>
    </section>

    <section>
      <h2>采集材料摘要</h2>
      <p>${escapeHtml(analysis.collectedSummary)}</p>
      <ul>${materialsHtml}</ul>
    </section>

    <section>
      <h2>成果与价值</h2>
      ${evidenceHtml || "<p>暂无成果证据</p>"}
    </section>

    <section>
      <h2>风险与阻塞</h2>
      <ul>${analysis.risks.map((r) => `<li>${escapeHtml(r)}</li>`).join("") || "<li>暂无</li>"}</ul>
    </section>

    <section>
      <h2>统一口径数据</h2>
      <ul>${metricsHtml}</ul>
    </section>

    <section>
      <h2>分析结论</h2>
      <ul>${analysis.conclusions.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
    </section>

    <section>
      <h2>下一步计划</h2>
      <ul>${nextHtml}</ul>
    </section>

    ${
      qualityHtml
        ? `<section><h2>质量检查</h2><ul>${qualityHtml}</ul></section>`
        : ""
    }
  </main>
</body>
</html>
`;
}
