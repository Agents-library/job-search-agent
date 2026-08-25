import type { LLMProvider, ProviderName } from "../../types";
import { createClaudeProvider } from "./claude";
import { createGeminiProvider } from "./gemini";
import { createGrokProvider } from "./grok";
import { createOpenAiProvider } from "./openai";
import { createOpenRouterProvider } from "./openrouter";

const factories: Record<
  ProviderName,
  (apiKey: string, model?: string) => LLMProvider
> = {
  claude: createClaudeProvider,
  openai: createOpenAiProvider,
  grok: createGrokProvider,
  gemini: createGeminiProvider,
  openrouter: createOpenRouterProvider,
};

export function getProvider(
  name: ProviderName,
  apiKey: string,
  model?: string,
): LLMProvider {
  return factories[name](apiKey, model);
}
