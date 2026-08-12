import type { AssistantConfig } from "../types.js";
import { runPipeline } from "../pipeline/run.js";

export interface SchedulerHandle {
  stop: () => void;
}

/**
 * 每小时自动触发一次采集与周报生成。
 * 使用 setInterval；进程内调度，适合本地守护或容器 sidecar。
 */
export function startHourlyScheduler(
  configLoader: () => Promise<AssistantConfig>,
  onResult?: (info: { ok: boolean; message: string }) => void,
  baseDir?: string,
): SchedulerHandle {
  let running = false;

  const tick = async () => {
    if (running) {
      onResult?.({ ok: false, message: "上一轮仍在执行，跳过本次小时触发" });
      return;
    }
    running = true;
    try {
      const config = await configLoader();
      if (!config.schedule.hourlyEnabled && config.schedule.mode !== "hourly") {
        onResult?.({ ok: false, message: "小时调度未启用" });
        return;
      }
      const report = await runPipeline(config, { baseDir });
      onResult?.({
        ok: true,
        message: `小时任务完成: md=${report.markdownPath ?? "-"} html=${report.htmlPath ?? "-"}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onResult?.({ ok: false, message: `小时任务失败: ${message}` });
    } finally {
      running = false;
    }
  };

  // 启动时立即跑一轮，随后每小时
  void tick();
  const timer = setInterval(() => {
    void tick();
  }, 60 * 60 * 1000);

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
