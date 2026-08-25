import type { LLMProvider } from "../../types";
import { createCompatibleProvider } from "./openaiCompatible";

export const OPENAI_DEFAULT_MODEL = "gpt-4o";

export function createOpenAiProvider(
  apiKey: string,
  model?: string,
): LLMProvider {
  return createCompatibleProvider({
    provider: "openai",
    apiKey,
    model,
    defaultModel: OPENAI_DEFAULT_MODEL,
    baseUrl: "https://api.openai.com/v1",
    filterModels: isOpenAiChatModel,
    listModels: true,
  });
}

function isOpenAiChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  const excluded = [
    "embed",
    "whisper",
    "tts",
    "dall-e",
    "davinci",
    "babbage",
    "ada",
    "moderation",
    "sora",
    "realtime",
    "transcribe",
    "image",
    "audio",
    "codex",
  ];
  if (excluded.some((part) => lower.includes(part))) {
    return false;
  }
  return (
    lower.startsWith("gpt-") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4") ||
    lower.startsWith("chatgpt")
  );
}
