import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  JobAgentConfig,
  ProviderName,
  ResolveConfigResult,
} from "../types";

export const PROVIDER_NAMES: readonly ProviderName[] = [
  "claude",
  "openai",
  "grok",
  "gemini",
  "openrouter",
];

const CONFIG_DIR_NAME = ".job-agent";
const CONFIG_FILE_NAME = "config.json";

export function isProviderName(value: unknown): value is ProviderName {
  return (
    typeof value === "string" &&
    (PROVIDER_NAMES as readonly string[]).includes(value)
  );
}

export function getConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

export function getConfigFilePath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

/** Path shown in CLI output (never an expanded home directory). */
export function getConfigFilePathDisplay(): string {
  return `~/${CONFIG_DIR_NAME}/${CONFIG_FILE_NAME}`;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 7) {
    return "...";
  }
  return `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}`;
}

function parseConfig(value: unknown): JobAgentConfig | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!isProviderName(record.provider)) {
    return null;
  }
  if (typeof record.apiKey !== "string" || record.apiKey.length === 0) {
    return null;
  }
  if (typeof record.model !== "string" || record.model.length === 0) {
    return null;
  }
  return {
    provider: record.provider,
    apiKey: record.apiKey,
    model: record.model,
  };
}

export async function readConfigFile(): Promise<JobAgentConfig | null> {
  try {
    const raw = await readFile(getConfigFilePath(), "utf8");
    return parseConfig(JSON.parse(raw) as unknown);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return null;
    }
    if (err instanceof SyntaxError) {
      return null;
    }
    throw err;
  }
}

export async function writeConfig(config: JobAgentConfig): Promise<void> {
  const dir = getConfigDir();
  const file = getConfigFilePath();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const body = `${JSON.stringify(
    {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
    },
    null,
    2,
  )}\n`;
  await writeFile(file, body, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(dir, 0o700);
    await chmod(file, 0o600);
  } catch {
    // Unix modes are best-effort on Windows.
  }
}

function envProvider(): ProviderName | undefined {
  const value = process.env.JOB_AGENT_PROVIDER;
  if (value === undefined || value === "") {
    return undefined;
  }
  if (!isProviderName(value)) {
    throw new Error(
      `Invalid JOB_AGENT_PROVIDER "${value}". Expected one of: ${PROVIDER_NAMES.join(", ")}`,
    );
  }
  return value;
}

export async function resolveConfig(): Promise<ResolveConfigResult> {
  const fromEnvProvider = envProvider();
  const fromEnvKey = process.env.JOB_AGENT_API_KEY;
  const fromEnvModel = process.env.JOB_AGENT_MODEL;
  const saved = await readConfigFile();

  const provider = fromEnvProvider ?? saved?.provider;
  const apiKey =
    fromEnvKey !== undefined && fromEnvKey !== "" ? fromEnvKey : saved?.apiKey;
  const model =
    fromEnvModel !== undefined && fromEnvModel !== ""
      ? fromEnvModel
      : saved?.model;

  if (!provider || !apiKey || !model) {
    return { configured: false };
  }

  return {
    configured: true,
    config: {
      provider,
      apiKey,
      model,
    },
  };
}
