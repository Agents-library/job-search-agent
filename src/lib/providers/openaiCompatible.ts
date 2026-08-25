import type { LLMProvider, MatchResult, ProviderName } from "../../types";
import { ProviderError } from "./errors";
import { providerRequest } from "./http";
import { extractJson, isRecord, parseMatchResult } from "./parse";
import { scoreMatchPrompt } from "../match/rubric";
import { tailorResumePrompt } from "../tailor/prompt";
import { PING_PROMPT } from "./placeholders";

export type CompatibleOptions = {
  provider: ProviderName;
  apiKey: string;
  model: string | undefined;
  defaultModel: string;
  baseUrl: string;
  extraHeaders?: Record<string, string>;
  filterModels?: (id: string) => boolean;
  listModels: boolean;
};

export function createCompatibleProvider(
  options: CompatibleOptions,
): LLMProvider {
  const resolvedModel = (): string =>
    options.model && options.model.length > 0
      ? options.model
      : options.defaultModel;

  const headers = (): Record<string, string> => ({
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
    ...options.extraHeaders,
  });

  const chat = async (
    userText: string,
    jsonMode: boolean,
  ): Promise<string> => {
    const body: Record<string, unknown> = {
      model: resolvedModel(),
      messages: [{ role: "user", content: userText }],
    };
    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const call = (payload: Record<string, unknown>): Promise<unknown> =>
      providerRequest({
        provider: options.provider,
        apiKey: options.apiKey,
        url: `${options.baseUrl}/chat/completions`,
        method: "POST",
        headers: headers(),
        body: payload,
      });

    let response: unknown;
    try {
      response = await call(body);
    } catch (err) {
      if (
        jsonMode &&
        err instanceof ProviderError &&
        err.status === 400
      ) {
        const fallback = { ...body };
        delete fallback.response_format;
        response = await call(fallback);
      } else {
        throw err;
      }
    }

    return contentFromChat(response, options.provider);
  };

  const provider: LLMProvider = {
    defaultModel: options.defaultModel,

    async scoreMatch(
      resume: string,
      jobDescription: string,
    ): Promise<MatchResult> {
      const text = await chat(scoreMatchPrompt(resume, jobDescription), true);
      const parsed = extractJson(text);
      if (parsed === undefined) {
        throw new ProviderError(
          options.provider,
          "scoreMatch did not return JSON",
        );
      }
      try {
        return parseMatchResult(parsed);
      } catch (err) {
        const message = err instanceof Error ? err.message : "invalid match result";
        throw new ProviderError(options.provider, message);
      }
    },

    async tailorResume(
      resume: string,
      jobDescription: string,
    ): Promise<string> {
      const text = await chat(
        tailorResumePrompt(resume, jobDescription),
        false,
      );
      if (text.trim().length === 0) {
        throw new ProviderError(
          options.provider,
          "tailorResume returned an empty response",
        );
      }
      return text;
    },

    async ping(): Promise<void> {
      const text = await chat(PING_PROMPT, false);
      if (text.trim().length === 0) {
        throw new ProviderError(
          options.provider,
          "ping returned an empty response",
        );
      }
    },
  };

  if (options.listModels) {
    provider.listModels = async (): Promise<string[]> => {
      const body = await providerRequest({
        provider: options.provider,
        apiKey: options.apiKey,
        url: `${options.baseUrl}/models`,
        method: "GET",
        headers: headers(),
      });
      const ids = modelIdsFromList(body);
      const filtered = options.filterModels
        ? ids.filter(options.filterModels)
        : ids;
      return [...new Set(filtered)].sort();
    };
  }

  return provider;
}

function contentFromChat(body: unknown, provider: ProviderName): string {
  if (!isRecord(body) || !Array.isArray(body.choices) || body.choices.length === 0) {
    throw new ProviderError(provider, "response was missing choices");
  }
  const choice = body.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    throw new ProviderError(provider, "response was missing message");
  }
  const content = choice.message.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (isRecord(part) && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }
  throw new ProviderError(provider, "response content was not text");
}

function modelIdsFromList(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    return [];
  }
  const ids: string[] = [];
  for (const item of body.data) {
    if (isRecord(item) && typeof item.id === "string") {
      ids.push(item.id);
    }
  }
  return ids;
}
