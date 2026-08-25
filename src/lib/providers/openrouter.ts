import type { LLMProvider } from "../../types";
import { createCompatibleProvider } from "./openaiCompatible";

export const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export function createOpenRouterProvider(
  apiKey: string,
  model?: string,
): LLMProvider {
  return createCompatibleProvider({
    provider: "openrouter",
    apiKey,
    model,
    defaultModel: OPENROUTER_DEFAULT_MODEL,
    baseUrl: "https://openrouter.ai/api/v1",
    extraHeaders: {
      "HTTP-Referer": "https://github.com/job-agent",
      "X-Title": "job-agent",
    },
    listModels: true,
  });
}
