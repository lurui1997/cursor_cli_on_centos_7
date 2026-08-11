import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DataSourceConfig, RawMaterial } from "../types.js";
import type { CollectContext, DataConnector } from "./base.js";
import { ensureAuthorized, materialId } from "./base.js";

const execFileAsync = promisify(execFile);

interface GitCommitRow {
  hash: string;
  subject: string;
  authorEmail: string;
  authorName: string;
  date: string;
}

async function runGit(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

function parseLog(stdout: string): GitCommitRow[] {
  if (!stdout) {
    return [];
  }
  return stdout.split("\n").map((line) => {
    const [hash, subject, authorEmail, authorName, date] = line.split("\t");
    return {
      hash: hash ?? "",
      subject: subject ?? "",
      authorEmail: authorEmail ?? "",
      authorName: authorName ?? "",
      date: date ?? "",
    };
  });
}

export const gitConnector: DataConnector = {
  kind: "git",
  async collect(source: DataSourceConfig, ctx: CollectContext): Promise<RawMaterial[]> {
    ensureAuthorized(source);
    const repoPath = String(source.options.repoPath ?? ".");
    const authorEmail = String(source.options.authorEmail ?? "").trim();
    const { start, end } = ctx.config.period;

    const args = [
      "log",
      "--no-merges",
      `--since=${start}T00:00:00`,
      `--until=${end}T23:59:59`,
      "--pretty=format:%H%x09%s%x09%ae%x09%an%x09%aI",
    ];
    if (authorEmail) {
      args.push(`--author=${authorEmail}`);
    }

    let rows: GitCommitRow[] = [];
    try {
      const stdout = await runGit(repoPath, args);
      rows = parseLog(stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return [
        {
          id: materialId(source.id, "error"),
          sourceId: source.id,
          sourceKind: "git",
          collectedAt: ctx.now.toISOString(),
          title: "Git 采集失败",
          summary: message,
          raw: { error: message },
          tags: ["error", "git"],
        },
      ];
    }

    const materials: RawMaterial[] = rows.map((row) => ({
      id: materialId(source.id, row.hash.slice(0, 12)),
      sourceId: source.id,
      sourceKind: "git",
      collectedAt: ctx.now.toISOString(),
      title: row.subject,
      summary: `${row.authorName} <${row.authorEmail}> 提交 ${row.hash.slice(0, 8)}`,
      occurredAt: row.date,
      raw: {
        hash: row.hash,
        subject: row.subject,
        authorEmail: row.authorEmail,
        authorName: row.authorName,
        metricHints: {
          commits: 1,
          commit_count: 1,
          提交次数: 1,
        },
      },
      tags: ["git", "commit"],
    }));

    materials.push({
      id: materialId(source.id, "summary"),
      sourceId: source.id,
      sourceKind: "git",
      collectedAt: ctx.now.toISOString(),
      title: "Git 周期汇总",
      summary: `采集到 ${rows.length} 条有效提交（口径：非 merge commit）`,
      raw: {
        metricHints: {
          commits: rows.length,
          commit_count: rows.length,
          提交次数: rows.length,
        },
        commitSubjects: rows.map((r) => r.subject),
      },
      tags: ["git", "aggregate"],
    });

    return materials;
  },
};
