import type { MatchResult } from "../../types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonUnknown(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const parsed = parseJsonUnknown(candidate);
  if (parsed !== undefined) {
    return parsed;
  }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return parseJsonUnknown(candidate.slice(start, end + 1));
  }
  return undefined;
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function parseMatchResult(value: unknown): MatchResult {
  if (!isRecord(value)) {
    throw new Error("match result was not a JSON object");
  }
  const rawPercent = value.matchPercent;
  if (typeof rawPercent !== "number" || !Number.isFinite(rawPercent)) {
    throw new Error("matchPercent was missing or not a number");
  }
  const matchPercent = Math.min(100, Math.max(0, rawPercent));
  const rationale =
    typeof value.rationale === "string" ? value.rationale : "";
  return {
    matchPercent,
    matchedSkills: stringArray(value.matchedSkills),
    missingSkills: stringArray(value.missingSkills),
    rationale,
  };
}

export function vendorErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  if (typeof body.message === "string" && body.message.length > 0) {
    return body.message;
  }
  const error = body.error;
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return undefined;
}
