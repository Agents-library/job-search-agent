import type { LLMProvider, MatchResult } from "../../types";
import { ProviderError } from "./errors";
import { providerRequest } from "./http";
import { extractJson, isRecord, parseMatchResult } from "./parse";
import { scoreMatchPrompt } from "../match/rubric";
import { tailorResumePrompt } from "../tailor/prompt";
import { PING_PROMPT } from "./placeholders";

export const CLAUDE_DEFAULT_MODEL = "claude-sonnet-4-5";

const ANTHROPIC_VERSION = "2023-06-01";
const MATCH_TOOL = "report_match";

export function createClaudeProvider(
  apiKey: string,
  model?: string,
): LLMProvider {
  const resolvedModel = (): string =>
    model && model.length > 0 ? model : CLAUDE_DEFAULT_MODEL;

  const headers = (): Record<string, string> => ({
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  });

  const messages = async (
    userText: string,
    tools?: unknown[],
    maxTokens?: number,
  ): Promise<unknown> => {
    const body: Record<string, unknown> = {
      model: resolvedModel(),
      max_tokens: tools ? 1024 : (maxTokens ?? 256),
      messages: [{ role: "user", content: userText }],
    };
    if (tools) {
      body.tools = tools;
      body.tool_choice = { type: "tool", name: MATCH_TOOL };
    }
    return providerRequest({
      provider: "claude",
      apiKey,
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: headers(),
      body,
    });
  };

  return {
    defaultModel: CLAUDE_DEFAULT_MODEL,

    async listModels(): Promise<string[]> {
      const ids: string[] = [];
      let afterId: string | undefined;
      for (;;) {
        const url = new URL("https://api.anthropic.com/v1/models");
        url.searchParams.set("limit", "100");
        if (afterId) {
          url.searchParams.set("after_id", afterId);
        }
        const body = await providerRequest({
          provider: "claude",
          apiKey,
          url: url.toString(),
          method: "GET",
          headers: headers(),
        });
        if (!isRecord(body) || !Array.isArray(body.data)) {
          break;
        }
        for (const item of body.data) {
          if (isRecord(item) && typeof item.id === "string") {
            ids.push(item.id);
          }
        }
        const last = body.data[body.data.length - 1];
        const lastId =
          isRecord(last) && typeof last.id === "string" ? last.id : undefined;
        if (body.has_more !== true || !lastId) {
          break;
        }
        afterId = lastId;
      }
      return [...new Set(ids)].sort();
    },

    async scoreMatch(
      resume: string,
      jobDescription: string,
    ): Promise<MatchResult> {
      const body = await messages(scoreMatchPrompt(resume, jobDescription), [
        {
          name: MATCH_TOOL,
          description: "Report the resume-to-job match result",
          input_schema: {
            type: "object",
            properties: {
              matchPercent: { type: "number" },
              matchedSkills: { type: "array", items: { type: "string" } },
              missingSkills: { type: "array", items: { type: "string" } },
              rationale: { type: "string" },
            },
            required: [
              "matchPercent",
              "matchedSkills",
              "missingSkills",
              "rationale",
            ],
          },
        },
      ]);
      const parsed = matchFromClaude(body);
      try {
        return parseMatchResult(parsed);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "invalid match result";
        throw new ProviderError("claude", message);
      }
    },

    async tailorResume(
      resume: string,
      jobDescription: string,
    ): Promise<string> {
      const body = await messages(
        tailorResumePrompt(resume, jobDescription),
        undefined,
        8192,
      );
      const text = textFromClaude(body);
      if (text.trim().length === 0) {
        throw new ProviderError("claude", "tailorResume returned an empty response");
      }
      return text;
    },

    async ping(): Promise<void> {
      const body = await messages(PING_PROMPT);
      const text = textFromClaude(body);
      if (text.trim().length === 0) {
        throw new ProviderError("claude", "ping returned an empty response");
      }
    },
  };
}

function textFromClaude(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.content)) {
    throw new ProviderError("claude", "response was missing content");
  }
  if (body.stop_reason === "max_tokens") {
    throw new ProviderError(
      "claude",
      "response was truncated (max_tokens)",
    );
  }
  const parts: string[] = [];
  for (const block of body.content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

function matchFromClaude(body: unknown): unknown {
  if (!isRecord(body) || !Array.isArray(body.content)) {
    throw new ProviderError("claude", "response was missing content");
  }
  for (const block of body.content) {
    if (
      isRecord(block) &&
      block.type === "tool_use" &&
      block.name === MATCH_TOOL
    ) {
      return block.input;
    }
  }
  const text = textFromClaude(body);
  const extracted = extractJson(text);
  if (extracted !== undefined) {
    return extracted;
  }
  throw new ProviderError("claude", "scoreMatch did not return a tool call");
}
