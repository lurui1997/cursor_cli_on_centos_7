import type { DataSourceConfig, RawMaterial } from "../types.js";
import type { CollectContext, DataConnector } from "./base.js";
import { ensureAuthorized, materialId } from "./base.js";

/** 用户自定义输入：notes 字符串数组或 structuredNotes 对象数组 */
export const customConnector: DataConnector = {
  kind: "custom",
  async collect(source: DataSourceConfig, ctx: CollectContext): Promise<RawMaterial[]> {
    ensureAuthorized(source);
    const notes = (source.options.notes as string[] | undefined) ?? [];
    const structured = (source.options.structuredNotes as Array<Record<string, unknown>> | undefined) ?? [];

    const fromNotes: RawMaterial[] = notes.map((note, index) => ({
      id: materialId(source.id, `note-${index}`),
      sourceId: source.id,
      sourceKind: "custom",
      collectedAt: ctx.now.toISOString(),
      title: `自定义备注 #${index + 1}`,
      summary: note,
      raw: { note },
      tags: ["custom", "note"],
    }));

    const fromStructured: RawMaterial[] = structured.map((item, index) => ({
      id: materialId(source.id, `structured-${index}`),
      sourceId: source.id,
      sourceKind: "custom",
      collectedAt: ctx.now.toISOString(),
      title: String(item.title ?? `结构化输入 #${index + 1}`),
      summary: String(item.summary ?? item.outcome ?? item.action ?? ""),
      occurredAt: typeof item.occurredAt === "string" ? item.occurredAt : undefined,
      raw: { ...item },
      tags: ["custom", "structured"],
    }));

    return [...fromNotes, ...fromStructured];
  },
};
