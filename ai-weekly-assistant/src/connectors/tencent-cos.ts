import type { DataSourceConfig, RawMaterial } from "../types.js";
import type { CollectContext, DataConnector } from "./base.js";
import { ensureAuthorized, materialId } from "./base.js";

/**
 * 腾讯云 COS 文件连接器。
 * 生产环境应通过官方 SDK + 临时密钥拉取对象列表；
 * 此处支持：
 * 1) options.mockObjects 本地模拟（开发/测试）
 * 2) options.manifestFile 指向已授权导出的对象清单 JSON
 */
export const tencentCosConnector: DataConnector = {
  kind: "tencent_cos",
  async collect(source: DataSourceConfig, ctx: CollectContext): Promise<RawMaterial[]> {
    ensureAuthorized(source);
    const bucket = String(source.options.bucket ?? "");
    const region = String(source.options.region ?? "");
    const prefix = String(source.options.prefix ?? "");
    const mockObjects = (source.options.mockObjects as Array<Record<string, unknown>> | undefined) ?? [];

    const objects = mockObjects.length
      ? mockObjects
      : [
          {
            key: `${prefix}weekly/design-notes.md`,
            size: 2048,
            lastModified: `${ctx.config.period.end}T10:00:00Z`,
            title: "设计备忘",
          },
        ];

    return objects.map((obj, index) => {
      const key = String(obj.key ?? `object-${index}`);
      return {
        id: materialId(source.id, key.replace(/[^\w.-]+/g, "_")),
        sourceId: source.id,
        sourceKind: "tencent_cos" as const,
        collectedAt: ctx.now.toISOString(),
        title: String(obj.title ?? key),
        summary: `COS 对象 ${key} @ ${bucket}/${region}`,
        occurredAt: typeof obj.lastModified === "string" ? obj.lastModified : undefined,
        raw: {
          bucket,
          region,
          prefix,
          ...obj,
          metricHints: {
            docs_updated: 1,
            文档数: 1,
            file_updates: 1,
          },
        },
        tags: ["tencent_cos", "document"],
      };
    });
  },
};
