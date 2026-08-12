import type { DataSourceConfig, DataSourceKind } from "../types.js";
import type { DataConnector } from "./base.js";
import { browserHistoryConnector } from "./browser-history.js";
import { customConnector } from "./custom.js";
import { gitConnector } from "./git.js";
import { tencentCosConnector } from "./tencent-cos.js";
import { tencentMeetingConnector } from "./tencent-meeting.js";
import { wecomFileConnector } from "./wecom-file.js";

const connectors: Record<DataSourceKind, DataConnector> = {
  git: gitConnector,
  browser_history: browserHistoryConnector,
  tencent_cos: tencentCosConnector,
  wecom_file: wecomFileConnector,
  tencent_meeting: tencentMeetingConnector,
  custom: customConnector,
};

export function getConnector(kind: DataSourceKind): DataConnector {
  switch (kind) {
    case "git":
    case "browser_history":
    case "tencent_cos":
    case "wecom_file":
    case "tencent_meeting":
    case "custom":
      return connectors[kind];
    default: {
      const _exhaustive: never = kind;
      throw new Error(`未知数据源类型: ${String(_exhaustive)}`);
    }
  }
}

export function listConnectors(): DataConnector[] {
  return Object.values(connectors);
}

export function describeSource(source: DataSourceConfig): string {
  const auth = source.auth.authorized ? "已授权" : "未授权";
  const enabled = source.enabled ? "启用" : "停用";
  return `${source.id} | ${source.displayName} | ${source.scope}/${source.kind} | ${enabled}/${auth}`;
}
