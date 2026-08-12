import type {
  AssistantConfig,
  MetricDefinition,
  NormalizedEvidence,
  QualityIssue,
  RawMaterial,
  WorkGoal,
} from "../types.js";

function resolveMetricKey(
  hintKey: string,
  metrics: MetricDefinition[],
): MetricDefinition | undefined {
  const lower = hintKey.toLowerCase();
  return metrics.find(
    (m) =>
      m.key === hintKey ||
      m.key.toLowerCase() === lower ||
      m.displayName === hintKey ||
      m.aliases.some((alias) => alias === hintKey || alias.toLowerCase() === lower),
  );
}

function inferGoalIds(text: string, goals: WorkGoal[]): string[] {
  const matched = goals.filter((goal) => {
    const hay = `${goal.title} ${goal.description}`.toLowerCase();
    const tokens = text.toLowerCase().split(/[\s,，。；;、/|-]+/).filter((t) => t.length >= 2);
    return tokens.some((token) => hay.includes(token) || goal.id.includes(token));
  });
  if (matched.length) {
    return matched.map((g) => g.id);
  }
  // 默认挂到最高优先级目标，避免无目标归属
  const top = [...goals].sort((a, b) => a.priority - b.priority)[0];
  return top ? [top.id] : [];
}

function looksLikeChronicle(text: string, forbidden: string[]): boolean {
  return forbidden.some((pattern) => text.includes(pattern));
}

function enrichOutcome(material: RawMaterial): { action: string; outcome: string; value: string; risks: string[] } {
  const structured = material.raw;
  const action = String(structured.action ?? (material.summary || material.title));
  const outcome = String(
    structured.outcome ??
      (material.sourceKind === "git"
        ? `形成可追溯提交「${material.title}」，进入版本历史供评审与回滚。`
        : material.sourceKind === "tencent_meeting"
          ? `形成会议决策与共识，可指导下一步执行。`
          : material.sourceKind === "tencent_cos" || material.sourceKind === "wecom_file"
            ? `沉淀可复用文档资产「${material.title}」。`
            : `将输入「${material.title}」转化为可引用的工作证据。`),
  );
  const value = String(
    structured.value ??
      (material.sourceKind === "git"
        ? "缩短从想法到可验证改动的反馈环，降低协作信息不对称。"
        : material.sourceKind === "tencent_meeting"
          ? "把口头讨论固化为可执行决策，减少重复沟通成本。"
          : "提升材料可检索性与口径一致性，支撑周报结论权威性。"),
  );
  const risksFromRaw = Array.isArray(structured.risks)
    ? structured.risks.map(String)
    : typeof structured.risk === "string"
      ? [structured.risk]
      : [];

  const defaultRisks =
    material.sourceKind === "git"
      ? ["若缺少测试/评审，提交可能引入回归风险。"]
      : material.sourceKind === "tencent_meeting"
        ? ["若决策未落到 owner 与截止日期，会议结论可能失效。"]
        : ["若材料未与目标/指标口径对齐，可能造成周报误判。"];

  return {
    action,
    outcome,
    value,
    risks: risksFromRaw.length ? risksFromRaw : defaultRisks,
  };
}

export interface NormalizeResult {
  evidence: NormalizedEvidence[];
  issues: QualityIssue[];
}

/** 统一字段与指标口径，并把动作升维为成果/价值/风险 */
export function normalizeMaterials(
  materials: RawMaterial[],
  config: AssistantConfig,
): NormalizeResult {
  const evidence: NormalizedEvidence[] = [];
  const issues: QualityIssue[] = [];

  for (const material of materials) {
    if (material.tags.includes("aggregate")) {
      continue;
    }

    const enriched = enrichOutcome(material);
    if (looksLikeChronicle(`${enriched.action} ${material.summary}`, config.standards.forbiddenPatterns)) {
      issues.push({
        code: "CHRONICLE_ONLY",
        severity: "warning",
        message: `材料疑似流水账表述，已强制升维成果/价值: ${material.title}`,
        targetId: material.id,
      });
    }

    const metricHints = (material.raw.metricHints as Record<string, number | string> | undefined) ?? {};
    const metrics: NormalizedEvidence["metrics"] = [];
    for (const [hintKey, hintValue] of Object.entries(metricHints)) {
      const def = resolveMetricKey(hintKey, config.metrics);
      if (!def) {
        issues.push({
          code: "METRIC_INCONSISTENT",
          severity: "warning",
          message: `未登记的指标别名「${hintKey}」，已丢弃以保证口径权威性`,
          targetId: material.id,
        });
        continue;
      }
      // 同一材料同一标准 key 只保留一次
      if (metrics.some((m) => m.key === def.key)) {
        continue;
      }
      metrics.push({
        key: def.key,
        value: hintValue,
        unit: def.unit,
        unified: true,
        confidence: "high",
      });
    }

    evidence.push({
      id: `ev-${material.id}`,
      sourceIds: [material.sourceId],
      goalIds: inferGoalIds(`${material.title} ${material.summary} ${enriched.outcome}`, config.goals),
      title: material.title,
      action: enriched.action,
      outcome: enriched.outcome,
      value: enriched.value,
      risks: enriched.risks,
      metrics,
      evidenceRefs: [material.id],
      occurredAt: material.occurredAt,
    });
  }

  // 聚合类材料：只用于统一口径汇总校验
  for (const material of materials.filter((m) => m.tags.includes("aggregate"))) {
    const metricHints = (material.raw.metricHints as Record<string, number | string> | undefined) ?? {};
    for (const hintKey of Object.keys(metricHints)) {
      if (!resolveMetricKey(hintKey, config.metrics)) {
        issues.push({
          code: "METRIC_INCONSISTENT",
          severity: "error",
          message: `汇总材料含未定义口径字段「${hintKey}」`,
          targetId: material.id,
        });
      }
    }
  }

  return { evidence, issues };
}

export function aggregateUnifiedMetrics(
  evidence: NormalizedEvidence[],
  metrics: MetricDefinition[],
): Array<{ key: string; displayName: string; value: number; unit: string; definition: string }> {
  return metrics
    .map((def) => {
      const values = evidence
        .flatMap((e) => e.metrics)
        .filter((m) => m.key === def.key && typeof m.value === "number")
        .map((m) => Number(m.value));
      const value = values.reduce((sum, n) => sum + n, 0);
      return {
        key: def.key,
        displayName: def.displayName,
        value,
        unit: def.unit,
        definition: def.definition,
      };
    })
    .filter((row) => row.value !== 0);
}
