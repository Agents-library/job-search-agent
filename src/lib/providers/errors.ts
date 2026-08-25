import type { ProviderName } from "../../types";

export class ProviderError extends Error {
  readonly provider: ProviderName;
  readonly status: number | undefined;

  constructor(provider: ProviderName, message: string, status?: number) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }
}

export function redact(text: string, apiKey: string): string {
  if (apiKey.length === 0) {
    return text;
  }
  return text.split(apiKey).join("[redacted]");
}

export function messageForStatus(status: number): string {
  if (status === 401 || status === 403) {
    return "authentication failed (check the API key)";
  }
  if (status === 404) {
    return "not found";
  }
  if (status === 429) {
    return "rate limited";
  }
  if (status >= 500) {
    return `provider error (HTTP ${status})`;
  }
  return `request failed (HTTP ${status})`;
}
