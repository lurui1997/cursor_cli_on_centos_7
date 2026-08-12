import type {
  AnalysisResult,
  AssistantConfig,
  NextStepPlan,
  NormalizedEvidence,
  QualityIssue,
  RawMaterial,
} from "../types.js";
import { aggregateUnifiedMetrics } from "./normalize.js";

const PLACEHOLDER_OWNERS = ["负责人待指定", "待定", "TBD", "tbd", "未指定", "n/a", "N/A", "-"];

function isPlaceholderOwner(owner: string): boolean {
  const trimmed = owner.trim();
  return !trimmed || PLACEHOLDER_OWNERS.includes(trimmed);
}

function isVagueNextStep(step: NextStepPlan): boolean {
  const vagueWords = ["继续推进", "跟进一下", "尽快处理", "加强沟通", "优化体验", "保持关注"];
  const text = `${step.title} ${step.definitionOfDone}`;
  if (vagueWords.some((w) => text.includes(w)) && step.definitionOfDone.length < 12) {
    return true;
  }
  if (isPlaceholderOwner(step.owner) || !step.dueDate.trim() || !step.definitionOfDone.trim()) {
    return true;
  }
  return false;
}

export function buildNextSteps(
  evidence: NormalizedEvidence[],
  config: AssistantConfig,
): NextStepPlan[] {
  const byGoal = new Map<string, NormalizedEvidence[]>();
  for (const item of evidence) {
    for (const goalId of item.goalIds) {
      const list = byGoal.get(goalId) ?? [];
      list.push(item);
      byGoal.set(goalId, list);
    }
  }

  const end = new Date(`${config.period.end}T00:00:00`);
  const due = new Date(end);
  due.setDate(due.getDate() + 3);
  const dueDate = due.toISOString().slice(0, 10);

  const steps: NextStepPlan[] = [];
  for (const goal of config.goals) {
    const related = byGoal.get(goal.id) ?? [];
    const topRisk = related.flatMap((e) => e.risks)[0] ?? "进度或口径可能漂移";
    steps.push({
      id: `next-${goal.id}`,
      title: `围绕「${goal.title}」完成可验收交付`,
      owner: goal.owner ?? "负责人待指定",
      dueDate,
      definitionOfDone: `满足：${goal.successCriteria[0] ?? "产出可演示结果"}；并处理风险「${topRisk}」的缓解动作。`,
      relatedGoalIds: [goal.id],
      relatedEvidenceIds: related.slice(0, 5).map((e) => e.id),
    });
  }

  return steps;
}

export function buildConclusions(
  evidence: NormalizedEvidence[],
  config: AssistantConfig,
  materials: RawMaterial[],
): string[] {
  const metrics = aggregateUnifiedMetrics(evidence, config.metrics);
  const metricText = metrics.length
    ? metrics.map((m) => `${m.displayName}=${m.value}${m.unit}`).join("，")
    : "本周尚无已统一口径的量化数据";

  const outcomeCount = evidence.filter((e) => e.outcome.trim().length > 0).length;
  const riskCount = new Set(evidence.flatMap((e) => e.risks)).size;

  return [
    `本周共采集 ${materials.length} 条材料，归一化为 ${evidence.length} 条成果证据；统一口径指标：${metricText}。`,
    `相对目标「${config.goals.map((g) => g.title).join(" / ")}」，已形成 ${outcomeCount} 项可陈述成果，识别 ${riskCount} 类潜在风险。`,
    "结论强调价值与风险，而非活动清单：优先用成果是否满足成功标准来判断周进度。",
  ];
}

export function evaluateQuality(
  evidence: NormalizedEvidence[],
  nextSteps: NextStepPlan[],
  config: AssistantConfig,
  extraIssues: QualityIssue[] = [],
): QualityIssue[] {
  const issues: QualityIssue[] = [...extraIssues];
  const { standards } = config;

  if (evidence.length < standards.minOutcomeItems) {
    issues.push({
      code: "MISSING_OUTCOME",
      severity: "warning",
      message: `成果条目仅 ${evidence.length} 条，低于标准下限 ${standards.minOutcomeItems}`,
    });
  }

  for (const item of evidence) {
    if (standards.requireOutcomeAndValue) {
      if (!item.outcome.trim()) {
        issues.push({
          code: "MISSING_OUTCOME",
          severity: "error",
          message: `缺少成果表述: ${item.title}`,
          targetId: item.id,
        });
      }
      if (!item.value.trim()) {
        issues.push({
          code: "MISSING_VALUE",
          severity: "error",
          message: `缺少价值表述: ${item.title}`,
          targetId: item.id,
        });
      }
    }
    if (standards.requireRisks && (!item.risks.length || item.risks.every((r) => !r.trim()))) {
      issues.push({
        code: "MISSING_RISK",
        severity: "error",
        message: `缺少风险提示: ${item.title}`,
        targetId: item.id,
      });
    }
  }

  if (standards.requireActionableNextSteps) {
    for (const step of nextSteps) {
      if (!isVagueNextStep(step)) {
        continue;
      }
      const missing: string[] = [];
      if (isPlaceholderOwner(step.owner)) {
        missing.push("负责人（不能留占位符）");
      }
      if (!step.dueDate.trim()) {
        missing.push("截止日期");
      }
      if (!step.definitionOfDone.trim()) {
        missing.push("完成定义");
      }
      const detail = missing.length ? `缺少${missing.join("、")}` : "表述笼统，需写清可验证的完成标准";
      issues.push({
        code: "VAGUE_NEXT_STEP",
        severity: "error",
        message: `下一步计划不可执行（${detail}）: ${step.title}`,
        targetId: step.id,
      });
    }
  }

  if (standards.requireUnifiedMetrics) {
    const nonUnified = evidence.flatMap((e) => e.metrics).filter((m) => !m.unified);
    for (const metric of nonUnified) {
      issues.push({
        code: "METRIC_INCONSISTENT",
        severity: "error",
        message: `指标未按统一口径归一: ${metric.key}`,
      });
    }
  }

  return issues;
}

export function analyze(
  materials: RawMaterial[],
  evidence: NormalizedEvidence[],
  config: AssistantConfig,
  preIssues: QualityIssue[] = [],
): AnalysisResult {
  const nextSteps = buildNextSteps(evidence, config);
  const conclusions = buildConclusions(evidence, config, materials);
  const risks = [...new Set(evidence.flatMap((e) => e.risks))];
  const qualityIssues = evaluateQuality(evidence, nextSteps, config, preIssues);

  const sourceNames = new Map(config.sources.map((s) => [s.id, s.displayName]));
  const bySource = new Map<string, number>();
  for (const material of materials) {
    bySource.set(material.sourceId, (bySource.get(material.sourceId) ?? 0) + 1);
  }
  const collectedSummary = [...bySource.entries()]
    .map(([sourceId, count]) => `${sourceNames.get(sourceId) ?? sourceId}: ${count} 条`)
    .join("；");

  return {
    period: config.period,
    goals: config.goals,
    materials,
    evidence,
    conclusions,
    risks,
    nextSteps,
    qualityIssues,
    collectedSummary: collectedSummary || "无已授权采集结果",
  };
}
