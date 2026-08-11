import { readFile } from "node:fs/promises";
import type { DataSourceConfig, RawMaterial } from "../types.js";
import type { CollectContext, DataConnector } from "./base.js";
import { ensureAuthorized, materialId } from "./base.js";

interface HistoryEntry {
  url: string;
  title: string;
  visitedAt: string;
}

/**
 * 浏览器历史连接器。
 * 默认读取 JSON 导出文件（避免直接访问锁定的 SQLite），格式：
 * [{ "url": "...", "title": "...", "visitedAt": "ISO" }]
 */
export const browserHistoryConnector: DataConnector = {
  kind: "browser_history",
  async collect(source: DataSourceConfig, ctx: CollectContext): Promise<RawMaterial[]> {
    ensureAuthorized(source);
    const historyFile = String(source.options.historyFile ?? "");
    const domains = (source.options.domains as string[] | undefined) ?? [];
    if (!historyFile) {
      return [
        {
          id: materialId(source.id, "missing-file"),
          sourceId: source.id,
          sourceKind: "browser_history",
          collectedAt: ctx.now.toISOString(),
          title: "浏览器历史未配置",
          summary: "请在 options.historyFile 指定导出的 JSON 历史文件路径",
          raw: {},
          tags: ["browser", "config"],
        },
      ];
    }

    let entries: HistoryEntry[] = [];
    try {
      const raw = await readFile(historyFile, "utf8");
      entries = JSON.parse(raw) as HistoryEntry[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return [
        {
          id: materialId(source.id, "read-error"),
          sourceId: source.id,
          sourceKind: "browser_history",
          collectedAt: ctx.now.toISOString(),
          title: "浏览器历史读取失败",
          summary: message,
          raw: { error: message },
          tags: ["browser", "error"],
        },
      ];
    }

    const start = new Date(`${ctx.config.period.start}T00:00:00`).getTime();
    const end = new Date(`${ctx.config.period.end}T23:59:59`).getTime();

    const filtered = entries.filter((entry) => {
      const ts = Date.parse(entry.visitedAt);
      if (Number.isNaN(ts) || ts < start || ts > end) {
        return false;
      }
      if (!domains.length) {
        return true;
      }
      try {
        const host = new URL(entry.url).hostname;
        return domains.some((d) => host === d || host.endsWith(`.${d}`));
      } catch {
        return false;
      }
    });

    return filtered.slice(0, 200).map((entry, index) => ({
      id: materialId(source.id, String(index)),
      sourceId: source.id,
      sourceKind: "browser_history",
      collectedAt: ctx.now.toISOString(),
      title: entry.title || entry.url,
      summary: `访问 ${entry.url}`,
      occurredAt: entry.visitedAt,
      raw: { ...entry },
      tags: ["browser", "research"],
    }));
  },
};
