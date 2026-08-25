import type { LLMProvider, MatchResult } from "../../types";
import { ProviderError } from "./errors";
import { providerRequest } from "./http";
import { extractJson, isRecord, parseMatchResult, stringArray } from "./parse";
import { scoreMatchPrompt } from "../match/rubric";
import { tailorResumePrompt } from "../tailor/prompt";
import { PING_PROMPT } from "./placeholders";

export const GEMINI_DEFAULT_MODEL = "gemini-flash-latest";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function createGeminiProvider(
  apiKey: string,
  model?: string,
): LLMProvider {
  const resolvedModel = (): string =>
    model && model.length > 0 ? model : GEMINI_DEFAULT_MODEL;

  const headers = (): Record<string, string> => ({
    "x-goog-api-key": apiKey,
    "Content-Type": "application/json",
  });

  const generate = async (
    userText: string,
    json: boolean,
  ): Promise<string> => {
    const modelId = stripModelsPrefix(resolvedModel());
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
    };
    if (json) {
      body.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            matchPercent: { type: "NUMBER" },
            matchedSkills: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
            missingSkills: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
            rationale: { type: "STRING" },
          },
          required: [
            "matchPercent",
            "matchedSkills",
            "missingSkills",
            "rationale",
          ],
        },
      };
    }
    const response = await providerRequest({
      provider: "gemini",
      apiKey,
      url: `${GEMINI_BASE}/models/${encodeURIComponent(modelId)}:generateContent`,
      method: "POST",
      headers: headers(),
      body,
    });
    return textFromGemini(response);
  };

  return {
    defaultModel: GEMINI_DEFAULT_MODEL,

    async listModels(): Promise<string[]> {
      const ids: string[] = [];
      let pageToken: string | undefined;
      for (;;) {
        const url = new URL(`${GEMINI_BASE}/models`);
        url.searchParams.set("pageSize", "100");
        if (pageToken) {
          url.searchParams.set("pageToken", pageToken);
        }
        const body = await providerRequest({
          provider: "gemini",
          apiKey,
          url: url.toString(),
          method: "GET",
          headers: headers(),
        });
        if (!isRecord(body) || !Array.isArray(body.models)) {
          break;
        }
        for (const item of body.models) {
          if (!isRecord(item) || typeof item.name !== "string") {
            continue;
          }
          const methods = stringArray(item.supportedGenerationMethods);
          if (!methods.includes("generateContent")) {
            continue;
          }
          ids.push(stripModelsPrefix(item.name));
        }
        if (typeof body.nextPageToken !== "string" || body.nextPageToken.length === 0) {
          break;
        }
        pageToken = body.nextPageToken;
      }
      return [...new Set(ids)].sort();
    },

    async scoreMatch(
      resume: string,
      jobDescription: string,
    ): Promise<MatchResult> {
      const text = await generate(
        scoreMatchPrompt(resume, jobDescription),
        true,
      );
      const parsed = extractJson(text);
      if (parsed === undefined) {
        throw new ProviderError("gemini", "scoreMatch did not return JSON");
      }
      try {
        return parseMatchResult(parsed);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "invalid match result";
        throw new ProviderError("gemini", message);
      }
    },

    async tailorResume(
      resume: string,
      jobDescription: string,
    ): Promise<string> {
      const text = await generate(
        tailorResumePrompt(resume, jobDescription),
        false,
      );
      if (text.trim().length === 0) {
        throw new ProviderError("gemini", "tailorResume returned an empty response");
      }
      return text;
    },

    async ping(): Promise<void> {
      const text = await generate(PING_PROMPT, false);
      if (text.trim().length === 0) {
        throw new ProviderError("gemini", "ping returned an empty response");
      }
    },
  };
}

function stripModelsPrefix(name: string): string {
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

function textFromGemini(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.candidates) || body.candidates.length === 0) {
    throw new ProviderError("gemini", "response was missing candidates");
  }
  const candidate = body.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content)) {
    throw new ProviderError("gemini", "response was missing content");
  }
  const parts = candidate.content.parts;
  if (!Array.isArray(parts)) {
    throw new ProviderError("gemini", "response was missing parts");
  }
  return parts
    .map((part) =>
      isRecord(part) && typeof part.text === "string" ? part.text : "",
    )
    .join("");
}
