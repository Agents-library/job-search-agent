import type { LLMProvider } from "../../types";
import { createCompatibleProvider } from "./openaiCompatible";

export const GROK_DEFAULT_MODEL = "grok-3";

export function createGrokProvider(
  apiKey: string,
  model?: string,
): LLMProvider {
  return createCompatibleProvider({
    provider: "grok",
    apiKey,
    model,
    defaultModel: GROK_DEFAULT_MODEL,
    baseUrl: "https://api.x.ai/v1",
    listModels: true,
  });
}
