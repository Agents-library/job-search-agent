import type { ProviderName } from "../../types";
import { messageForStatus, ProviderError, redact } from "./errors";
import { parseJsonUnknown, vendorErrorMessage } from "./parse";
import { RetryableError, withRetry } from "./retry";

const REQUEST_TIMEOUT_MS = 60_000;

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err.name === "AbortError" || err.name === "TimeoutError")
  );
}

function looksLikeAuthFailure(
  status: number,
  vendor: string | undefined,
): boolean {
  if (status === 401 || status === 403) {
    return true;
  }
  if (!vendor) {
    return false;
  }
  const lower = vendor.toLowerCase();
  return (
    lower.includes("api key") &&
    (lower.includes("invalid") ||
      lower.includes("incorrect") ||
      lower.includes("not valid"))
  );
}

export async function providerRequest(args: {
  provider: ProviderName;
  apiKey: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}): Promise<unknown> {
  try {
    return await withRetry(async () => {
      let res: Response;
      const controller = new AbortController();
      const deadline = Date.now() + REQUEST_TIMEOUT_MS;
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        res = await fetch(args.url, {
          method: args.method,
          headers: args.headers,
          body:
            args.body === undefined ? undefined : JSON.stringify(args.body),
          signal: controller.signal,
        });
      } catch (err) {
        const timedOut = controller.signal.aborted && Date.now() >= deadline;
        if (isAbortError(err) && timedOut) {
          throw new RetryableError(
            `${args.provider}: network error (${redact("request timed out", args.apiKey)})`,
          );
        }
        const raw = err instanceof Error ? err.message : "network error";
        throw new RetryableError(
          `${args.provider}: network error (${redact(raw, args.apiKey)})`,
        );
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError(
          `${args.provider}: ${messageForStatus(res.status)}`,
          res.status,
        );
      }

      const raw = await res.text();
      const parsed = parseJsonUnknown(raw);

      if (!res.ok) {
        const vendor = vendorErrorMessage(parsed);
        const status = looksLikeAuthFailure(res.status, vendor) ? 401 : res.status;
        const base = messageForStatus(status);
        const detail =
          vendor && status !== 401 && status !== 403
            ? `${base}: ${redact(vendor, args.apiKey)}`
            : base;
        throw new ProviderError(args.provider, detail, status);
      }

      return parsed === undefined ? {} : parsed;
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      throw err;
    }
    if (err instanceof RetryableError) {
      const stripped = err.message.startsWith(`${args.provider}: `)
        ? err.message.slice(args.provider.length + 2)
        : err.message;
      throw new ProviderError(
        args.provider,
        redact(stripped, args.apiKey),
        err.status,
      );
    }
    const raw = err instanceof Error ? err.message : "unknown error";
    throw new ProviderError(args.provider, redact(raw, args.apiKey));
  }
}
