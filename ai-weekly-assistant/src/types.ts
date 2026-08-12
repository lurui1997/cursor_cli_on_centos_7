/** 数据源类别 */
export type DataSourceKind =
  | "git"
  | "browser_history"
  | "tencent_cos"
  | "wecom_file"
  | "tencent_meeting"
  | "custom";

export type DataSourceScope = "local" | "remote" | "custom";

export type ReportFormat = "markdown" | "html" | "both";

export type TriggerMode = "manual" | "hourly";

/** 人类设定的工作目标 */
export interface WorkGoal {
  id: string;
  title: string;
  description: string;
  /** 成功标准 / 验收口径 */
  successCriteria: string[];
  /** 本周优先级 1-5，1 最高 */
  priority: 1 | 2 | 3 | 4 | 5;
  owner?: string;
}

/** 周报写作标准（用于避免流水账等问题） */
export interface ReportStandards {
  /** 要求成果与价值表述，禁止仅罗列动作 */
  requireOutcomeAndValue: boolean;
  /** 要求指出潜在风险 */
  requireRisks: boolean;
  /** 下一步计划必须可执行（含负责人/时间/完成定义） */
  requireActionableNextSteps: boolean;
  /** 统一数据字段与口径，跨材料可对齐 */
  requireUnifiedMetrics: boolean;
  /** 最少成果条目数 */
  minOutcomeItems: number;
  /** 禁止出现的流水账句式提示词 */
  forbiddenPatterns: string[];
  /** 周报章节结构 */
  sections: string[];
  language: "zh-CN" | "en";
}

/** 统一指标口径定义 */
export interface MetricDefinition {
  key: string;
  displayName: string;
  unit: string;
  /** 口径说明，保证跨材料一致 */
  definition: string;
  /** 可接受的别名，用于归一化 */
  aliases: string[];
}

export interface DataSourceAuth {
  authorized: boolean;
  authorizedAt?: string;
  /** 授权人 */
  authorizedBy?: string;
  /** 授权范围说明 */
  scopeNote?: string;
  credentialsRef?: string;
}

export interface DataSourceConfig {
  id: string;
  kind: DataSourceKind;
  scope: DataSourceScope;
  displayName: string;
  enabled: boolean;
  auth: DataSourceAuth;
  options: Record<string, unknown>;
}

export interface AssistantConfig {
  version: 1;
  workspaceName: string;
  period: {
    /** ISO date YYYY-MM-DD */
    start: string;
    end: string;
  };
  goals: WorkGoal[];
  standards: ReportStandards;
  metrics: MetricDefinition[];
  sources: DataSourceConfig[];
  output: {
    format: ReportFormat;
    directory: string;
    titleTemplate: string;
  };
  schedule: {
    mode: TriggerMode;
    hourlyEnabled: boolean;
    timezone: string;
  };
}

/** 采集到的原始材料 */
export interface RawMaterial {
  id: string;
  sourceId: string;
  sourceKind: DataSourceKind;
  collectedAt: string;
  title: string;
  summary: string;
  occurredAt?: string;
  raw: Record<string, unknown>;
  tags: string[];
}

/** 归一化后的证据条目（统一字段与口径） */
export interface NormalizedEvidence {
  id: string;
  sourceIds: string[];
  goalIds: string[];
  title: string;
  /** 做了什么（动作） */
  action: string;
  /** 产出了什么（成果） */
  outcome: string;
  /** 为什么重要（价值） */
  value: string;
  /** 潜在风险 */
  risks: string[];
  metrics: Array<{
    key: string;
    value: number | string;
    unit: string;
    /** 是否已按统一口径归一 */
    unified: boolean;
    confidence: "high" | "medium" | "low";
  }>;
  evidenceRefs: string[];
  occurredAt?: string;
}

export interface NextStepPlan {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  definitionOfDone: string;
  relatedGoalIds: string[];
  relatedEvidenceIds: string[];
}

export interface QualityIssue {
  code:
    | "CHRONICLE_ONLY"
    | "MISSING_OUTCOME"
    | "MISSING_VALUE"
    | "MISSING_RISK"
    | "VAGUE_NEXT_STEP"
    | "METRIC_INCONSISTENT"
    | "UNAUTHORIZED_SOURCE";
  severity: "error" | "warning";
  message: string;
  targetId?: string;
}

export interface AnalysisResult {
  period: { start: string; end: string };
  goals: WorkGoal[];
  materials: RawMaterial[];
  evidence: NormalizedEvidence[];
  conclusions: string[];
  risks: string[];
  nextSteps: NextStepPlan[];
  qualityIssues: QualityIssue[];
  collectedSummary: string;
}

export interface GeneratedReport {
  format: ReportFormat;
  markdownPath?: string;
  htmlPath?: string;
  analysis: AnalysisResult;
  generatedAt: string;
}
