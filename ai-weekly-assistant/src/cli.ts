#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  authorizeSource,
  initConfig,
  loadConfig,
  revokeSource,
  saveConfig,
} from "./config/store.js";
import { describeSource } from "./connectors/registry.js";
import { runPipeline } from "./pipeline/run.js";
import { startHourlyScheduler } from "./scheduler/hourly.js";
import type { AssistantConfig, WorkGoal } from "./types.js";

const program = new Command();

program
  .name("weekly-assistant")
  .description("AI 周报助手：设定目标与标准、授权数据源、定时/手动生成有成果意识的周报")
  .version("0.1.0");

program
  .command("init")
  .description("初始化周报工作区配置（目标、标准、数据源）")
  .option("-c, --config <path>", "配置文件路径", "./weekly.config.json")
  .option("-n, --name <workspace>", "工作区名称", "默认工作区")
  .action(async (opts: { config: string; name: string }) => {
    const config = await initConfig(path.resolve(opts.config), opts.name);
    console.log(`已写入配置: ${path.resolve(opts.config)}`);
    console.log(`目标数: ${config.goals.length}，数据源数: ${config.sources.length}`);
    console.log("下一步：用 authorize 授权数据源，再用 set-goals / 编辑配置完善目标与标准。");
  });

program
  .command("set-goals")
  .description("用 JSON 文件覆盖工作目标")
  .requiredOption("-c, --config <path>", "配置文件路径")
  .requiredOption("-f, --file <goals.json>", "目标 JSON 数组文件")
  .action(async (opts: { config: string; file: string }) => {
    const config = await loadConfig(path.resolve(opts.config));
    const raw = await readFile(path.resolve(opts.file), "utf8");
    const goals = JSON.parse(raw) as WorkGoal[];
    if (!Array.isArray(goals) || !goals.length) {
      throw new Error("goals 文件必须是非空数组");
    }
    const next: AssistantConfig = { ...config, goals };
    await saveConfig(path.resolve(opts.config), next);
    console.log(`已更新 ${goals.length} 个工作目标`);
  });

program
  .command("set-standards")
  .description("用 JSON 文件覆盖周报标准")
  .requiredOption("-c, --config <path>", "配置文件路径")
  .requiredOption("-f, --file <standards.json>", "标准 JSON 文件")
  .action(async (opts: { config: string; file: string }) => {
    const config = await loadConfig(path.resolve(opts.config));
    const raw = await readFile(path.resolve(opts.file), "utf8");
    const standards = JSON.parse(raw) as AssistantConfig["standards"];
    const next: AssistantConfig = {
      ...config,
      standards: {
        ...config.standards,
        ...standards,
        requireOutcomeAndValue: true,
        requireRisks: true,
        requireActionableNextSteps: true,
        requireUnifiedMetrics: true,
      },
    };
    await saveConfig(path.resolve(opts.config), next);
    console.log("已更新周报标准（成果/风险/可执行下一步/统一口径已强制开启）");
  });

program
  .command("sources")
  .description("列出数据源与授权状态")
  .requiredOption("-c, --config <path>", "配置文件路径")
  .action(async (opts: { config: string }) => {
    const config = await loadConfig(path.resolve(opts.config));
    for (const source of config.sources) {
      console.log(describeSource(source));
    }
  });

program
  .command("authorize")
  .description("授权指定数据源（授权后才可采集）")
  .requiredOption("-c, --config <path>", "配置文件路径")
  .requiredOption("-s, --source <id>", "数据源 id")
  .option("-b, --by <name>", "授权人", "local-user")
  .option("--note <text>", "授权范围说明")
  .action(async (opts: { config: string; source: string; by: string; note?: string }) => {
    const configPath = path.resolve(opts.config);
    const config = await loadConfig(configPath);
    const next = authorizeSource(config, opts.source, opts.by, opts.note);
    await saveConfig(configPath, next);
    console.log(`已授权: ${opts.source}`);
  });

program
  .command("revoke")
  .description("撤销数据源授权并停用")
  .requiredOption("-c, --config <path>", "配置文件路径")
  .requiredOption("-s, --source <id>", "数据源 id")
  .action(async (opts: { config: string; source: string }) => {
    const configPath = path.resolve(opts.config);
    const config = await loadConfig(configPath);
    const next = revokeSource(config, opts.source);
    await saveConfig(configPath, next);
    console.log(`已撤销: ${opts.source}`);
  });

program
  .command("add-note")
  .description("追加一条自定义输入材料")
  .requiredOption("-c, --config <path>", "配置文件路径")
  .requiredOption("-t, --text <note>", "备注文本")
  .option("--source <id>", "自定义源 id", "src-custom")
  .action(async (opts: { config: string; text: string; source: string }) => {
    const configPath = path.resolve(opts.config);
    const config = await loadConfig(configPath);
    const sources = config.sources.map((source) => {
      if (source.id !== opts.source) {
        return source;
      }
      const notes = Array.isArray(source.options.notes) ? [...(source.options.notes as string[])] : [];
      notes.push(opts.text);
      return {
        ...source,
        enabled: true,
        auth: source.auth.authorized
          ? source.auth
          : {
              authorized: true,
              authorizedAt: new Date().toISOString(),
              authorizedBy: "local-user",
            },
        options: { ...source.options, notes },
      };
    });
    await saveConfig(configPath, { ...config, sources });
    console.log(`已写入自定义备注到 ${opts.source}`);
  });

program
  .command("run")
  .description("手动触发：采集已授权材料并生成周报（markdown/html）")
  .requiredOption("-c, --config <path>", "配置文件路径")
  .option("--dry-run", "只分析不写文件", false)
  .action(async (opts: { config: string; dryRun?: boolean }) => {
    const configPath = path.resolve(opts.config);
    const config = await loadConfig(configPath);
    const report = await runPipeline(config, {
      write: !opts.dryRun,
      baseDir: path.dirname(configPath),
    });
    console.log(`生成时间: ${report.generatedAt}`);
    console.log(`采集摘要: ${report.analysis.collectedSummary}`);
    console.log(`成果证据: ${report.analysis.evidence.length}`);
    console.log(`质量问题: ${report.analysis.qualityIssues.length}`);
    if (report.markdownPath) {
      console.log(`Markdown: ${report.markdownPath}`);
    }
    if (report.htmlPath) {
      console.log(`HTML: ${report.htmlPath}`);
    }
    for (const issue of report.analysis.qualityIssues.slice(0, 10)) {
      console.log(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
  });

program
  .command("schedule")
  .description("启动每小时自动触发（前台运行，Ctrl+C 退出）")
  .requiredOption("-c, --config <path>", "配置文件路径")
  .action(async (opts: { config: string }) => {
    const configPath = path.resolve(opts.config);
    const config = await loadConfig(configPath);
    config.schedule.hourlyEnabled = true;
    config.schedule.mode = "hourly";
    await saveConfig(configPath, config);

    console.log("已启用小时调度，正在前台运行…");
    const handle = startHourlyScheduler(
      async () => loadConfig(configPath),
      (info) => {
        const ts = new Date().toISOString();
        console.log(`[${ts}] ${info.ok ? "OK" : "WARN"} ${info.message}`);
      },
      path.dirname(configPath),
    );

    const shutdown = () => {
      handle.stop();
      console.log("调度已停止");
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program
  .command("export-config-template")
  .description("导出一份带注释说明的纯 JSON 模板路径提示")
  .option("-o, --out <path>", "输出路径", "./examples/weekly.config.example.json")
  .action(async (opts: { out: string }) => {
    // 实际模板由 examples 目录维护；此命令便于复制
    const examplePath = path.resolve("examples/weekly.config.example.json");
    try {
      const raw = await readFile(examplePath, "utf8");
      await writeFile(path.resolve(opts.out), raw, "utf8");
      console.log(`已导出模板到 ${path.resolve(opts.out)}`);
    } catch {
      console.log("请直接使用仓库内 examples/weekly.config.example.json");
    }
  });

await program.parseAsync(process.argv);
