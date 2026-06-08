import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const aiLiveFlag = "FOODHUB_AI_LIVE";
export const envPath = path.resolve(".env");
export const envExamplePath = path.resolve(".env.example");

export function readAiLiveConfig(): boolean {
  const fileValue = readEnvValue(envPath, aiLiveFlag) ?? readEnvValue(envExamplePath, aiLiveFlag);
  return isEnabled(fileValue ?? process.env[aiLiveFlag] ?? "false");
}

export function loadProjectEnvConfig() {
  loadEnvFile(envExamplePath, false);
  loadEnvFile(envPath, true);
}

export function writeAiLiveConfig(enabled: boolean) {
  upsertEnvValue(envPath, aiLiveFlag, String(enabled));
  upsertEnvValue(envExamplePath, aiLiveFlag, String(enabled));
}

function readEnvValue(filePath: string, key: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    if (trimmed.slice(0, separatorIndex).trim() === key) {
      return trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }

  return undefined;
}

function loadEnvFile(filePath: string, overrideExisting: boolean) {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && (overrideExisting || process.env[key] === undefined)) {
      process.env[key] = value;
    }
  }
}

function upsertEnvValue(filePath: string, key: string, value: string) {
  const lines = existsSync(filePath) ? readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  let replaced = false;
  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return line;
    }

    const name = trimmed.slice(0, trimmed.indexOf("=")).trim();
    if (name !== key) {
      return line;
    }

    replaced = true;
    return `${key}=${value}`;
  });

  if (!replaced) {
    updated.push(`${key}=${value}`);
  }

  writeFileSync(filePath, `${updated.filter((line, index) => index < updated.length - 1 || line !== "").join("\n")}\n`, "utf8");
}

function isEnabled(value: string) {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
