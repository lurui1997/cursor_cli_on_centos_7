import type { AssistantConfig, DataSourceConfig, RawMaterial } from "../types.js";

export interface CollectContext {
  config: AssistantConfig;
  now: Date;
}

export interface DataConnector {
  kind: DataSourceConfig["kind"];
  collect(source: DataSourceConfig, ctx: CollectContext): Promise<RawMaterial[]>;
}

export function ensureAuthorized(source: DataSourceConfig): void {
  if (!source.auth.authorized) {
    throw new Error(`数据源未授权，拒绝采集: ${source.displayName} (${source.id})`);
  }
  if (!source.enabled) {
    throw new Error(`数据源未启用: ${source.displayName} (${source.id})`);
  }
}

export function materialId(sourceId: string, suffix: string): string {
  return `${sourceId}:${suffix}`;
}
