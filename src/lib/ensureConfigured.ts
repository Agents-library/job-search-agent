import { resolveConfig } from "./config";
import { runInit } from "./configure";
import type { JobAgentConfig } from "../types";

export async function ensureConfigured(): Promise<JobAgentConfig> {
  const resolved = await resolveConfig();
  if (resolved.configured) {
    return resolved.config;
  }
  return runInit();
}
