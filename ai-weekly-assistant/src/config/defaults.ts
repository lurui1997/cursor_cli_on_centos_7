import type { AssistantConfig, ReportStandards } from "../types.js";

export const DEFAULT_STANDARDS: ReportStandards = {
  requireOutcomeAndValue: true,
  requireRisks: true,
  requireActionableNextSteps: true,
  requireUnifiedMetrics: true,
  minOutcomeItems: 3,
  forbiddenPatterns: [
    "今天做了",
    "处理了一些",
    "跟进一下",
    "开会讨论",
    "日常维护",
    "修了几个 bug",
    "看了一下",
  ],
  sections: [
    "本周目标对齐",
    "采集材料摘要",
    "成果与价值",
    "风险与阻塞",
    "统一口径数据",
    "分析结论",
    "下一步计划",
  ],
  language: "zh-CN",
};

export function createDefaultConfig(partial?: Partial<AssistantConfig>): AssistantConfig {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 6);
  const start = startDate.toISOString().slice(0, 10);

  return {
    version: 1,
    workspaceName: partial?.workspaceName ?? "默认工作区",
    period: partial?.period ?? { start, end },
    goals: partial?.goals ?? [
      {
        id: "goal-delivery",
        title: "关键交付推进",
        description: "按承诺节奏推进核心功能，并形成可验收成果。",
        successCriteria: [
          "有可演示或可合并的交付物",
          "关键风险有明确 owner 与缓解措施",
        ],
        priority: 1,
      },
      {
        id: "goal-quality",
        title: "质量与稳定性",
        description: "降低回归与线上风险，保证口径一致的质量数据。",
        successCriteria: [
          "缺陷与事故有统一计数口径",
          "对高风险变更有回滚/观测方案",
        ],
        priority: 2,
      },
    ],
    standards: partial?.standards ?? DEFAULT_STANDARDS,
    metrics: partial?.metrics ?? [
      {
        key: "pr_merged",
        displayName: "合并 PR 数",
        unit: "个",
        definition: "本周期内合并到主分支的 Pull Request 数量（不含 revert 自身的 merge）。",
        aliases: ["merged_prs", "PR合并数", "合并请求数"],
      },
      {
        key: "commits",
        displayName: "有效提交数",
        unit: "次",
        definition: "本周期内作者提交且非 merge 的 commit 数量。",
        aliases: ["commit_count", "提交次数"],
      },
      {
        key: "meeting_hours",
        displayName: "会议时长",
        unit: "小时",
        definition: "腾讯会议等已授权会议记录中的有效会议总时长（按分钟汇总后换算小时，保留 1 位小数）。",
        aliases: ["会议小时", "meeting_duration_hours"],
      },
      {
        key: "docs_updated",
        displayName: "文档更新数",
        unit: "份",
        definition: "云文档/企微文件中本周期有实质内容变更的文档份数。",
        aliases: ["文档数", "file_updates"],
      },
    ],
    sources: partial?.sources ?? [
      {
        id: "src-git",
        kind: "git",
        scope: "local",
        displayName: "本地 Git 仓库",
        enabled: true,
        auth: { authorized: false },
        options: { repoPath: ".", authorEmail: "" },
      },
      {
        id: "src-browser",
        kind: "browser_history",
        scope: "local",
        displayName: "浏览器历史",
        enabled: false,
        auth: { authorized: false },
        options: { historyFile: "", domains: [] },
      },
      {
        id: "src-cos",
        kind: "tencent_cos",
        scope: "remote",
        displayName: "腾讯云文件 (COS)",
        enabled: false,
        auth: { authorized: false },
        options: { bucket: "", region: "", prefix: "" },
      },
      {
        id: "src-wecom",
        kind: "wecom_file",
        scope: "remote",
        displayName: "企业微信文件",
        enabled: false,
        auth: { authorized: false },
        options: { corpId: "", agentId: "", folderId: "" },
      },
      {
        id: "src-meeting",
        kind: "tencent_meeting",
        scope: "remote",
        displayName: "腾讯会议",
        enabled: false,
        auth: { authorized: false },
        options: { userid: "", includeTranscript: true },
      },
      {
        id: "src-custom",
        kind: "custom",
        scope: "custom",
        displayName: "用户自定义输入",
        enabled: true,
        auth: { authorized: true, authorizedBy: "user", authorizedAt: new Date().toISOString() },
        options: { notes: [] as string[] },
      },
    ],
    output: partial?.output ?? {
      format: "both",
      directory: "./output",
      titleTemplate: "{{workspace}} 周报 {{start}} ~ {{end}}",
    },
    schedule: partial?.schedule ?? {
      mode: "manual",
      hourlyEnabled: false,
      timezone: "Asia/Shanghai",
    },
  };
}

export function assertConfig(config: AssistantConfig): void {
  if (config.version !== 1) {
    throw new Error(`不支持的配置版本: ${config.version}`);
  }
  if (!config.goals.length) {
    throw new Error("至少需要设定一个工作目标");
  }
  if (!config.standards.requireOutcomeAndValue) {
    throw new Error("标准校验失败：必须开启成果与价值要求，以避免流水账");
  }
}
