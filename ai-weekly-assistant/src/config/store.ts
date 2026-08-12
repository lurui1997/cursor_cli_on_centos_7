import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssistantConfig } from "../types.js";
import { assertConfig, createDefaultConfig } from "./defaults.js";

export async function loadConfig(configPath: string): Promise<AssistantConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as AssistantConfig;
  assertConfig(parsed);
  return parsed;
}

export async function saveConfig(configPath: string, config: AssistantConfig): Promise<void> {
  assertConfig(config);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function initConfig(configPath: string, workspaceName?: string): Promise<AssistantConfig> {
  const config = createDefaultConfig({
    workspaceName: workspaceName ?? "默认工作区",
  });
  await saveConfig(configPath, config);
  return config;
}

export function authorizeSource(
  config: AssistantConfig,
  sourceId: string,
  authorizedBy: string,
  scopeNote?: string,
): AssistantConfig {
  const sources = config.sources.map((source) => {
    if (source.id !== sourceId) {
      return source;
    }
    return {
      ...source,
      enabled: true,
      auth: {
        authorized: true,
        authorizedAt: new Date().toISOString(),
        authorizedBy,
        scopeNote: scopeNote ?? source.auth.scopeNote,
        credentialsRef: source.auth.credentialsRef,
      },
    };
  });

  const found = sources.some((s) => s.id === sourceId);
  if (!found) {
    throw new Error(`未找到数据源: ${sourceId}`);
  }

  return { ...config, sources };
}

export function revokeSource(config: AssistantConfig, sourceId: string): AssistantConfig {
  const sources = config.sources.map((source) => {
    if (source.id !== sourceId) {
      return source;
    }
    return {
      ...source,
      enabled: false,
      auth: {
        authorized: false,
        scopeNote: source.auth.scopeNote,
        credentialsRef: source.auth.credentialsRef,
      },
    };
  });
  return { ...config, sources };
}
