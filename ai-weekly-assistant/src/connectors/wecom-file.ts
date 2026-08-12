import type { DataSourceConfig, RawMaterial } from "../types.js";
import type { CollectContext, DataConnector } from "./base.js";
import { ensureAuthorized, materialId } from "./base.js";

/** 企业微信文件连接器（支持 mockFiles / 授权后 API 清单） */
export const wecomFileConnector: DataConnector = {
  kind: "wecom_file",
  async collect(source: DataSourceConfig, ctx: CollectContext): Promise<RawMaterial[]> {
    ensureAuthorized(source);
    const corpId = String(source.options.corpId ?? "");
    const folderId = String(source.options.folderId ?? "");
    const mockFiles = (source.options.mockFiles as Array<Record<string, unknown>> | undefined) ?? [];

    const files = mockFiles.length
      ? mockFiles
      : [
          {
            fileId: "wecom-file-1",
            name: "需求评审纪要",
            updatedAt: `${ctx.config.period.end}T08:30:00Z`,
            author: "产品同事",
          },
        ];

    return files.map((file, index) => {
      const fileId = String(file.fileId ?? `file-${index}`);
      return {
        id: materialId(source.id, fileId),
        sourceId: source.id,
        sourceKind: "wecom_file" as const,
        collectedAt: ctx.now.toISOString(),
        title: String(file.name ?? fileId),
        summary: `企微文件 ${fileId}（corp=${corpId || "n/a"}, folder=${folderId || "n/a"}）`,
        occurredAt: typeof file.updatedAt === "string" ? file.updatedAt : undefined,
        raw: {
          corpId,
          folderId,
          ...file,
          metricHints: {
            docs_updated: 1,
            文档更新数: 1,
            file_updates: 1,
          },
        },
        tags: ["wecom", "document"],
      };
    });
  },
};
