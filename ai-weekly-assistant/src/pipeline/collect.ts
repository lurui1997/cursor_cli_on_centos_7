import type { AssistantConfig, QualityIssue, RawMaterial } from "../types.js";
import { getConnector } from "../connectors/registry.js";

export interface CollectResult {
  materials: RawMaterial[];
  skipped: QualityIssue[];
}

/** 仅采集已授权且启用的数据源 */
export async function collectMaterials(config: AssistantConfig, now = new Date()): Promise<CollectResult> {
  const materials: RawMaterial[] = [];
  const skipped: QualityIssue[] = [];

  for (const source of config.sources) {
    if (!source.enabled) {
      continue;
    }
    if (!source.auth.authorized) {
      skipped.push({
        code: "UNAUTHORIZED_SOURCE",
        severity: "error",
        message: `跳过未授权数据源: ${source.displayName} (${source.id})`,
        targetId: source.id,
      });
      continue;
    }

    const connector = getConnector(source.kind);
    const batch = await connector.collect(source, { config, now });
    materials.push(...batch);
  }

  return { materials, skipped };
}
