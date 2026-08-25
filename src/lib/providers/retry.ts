export class RetryableError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "RetryableError";
    this.status = status;
  }
}

const MAX_ATTEMPTS = 4;
const INITIAL_DELAY_MS = 400;

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let delayMs = INITIAL_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === MAX_ATTEMPTS || !isRetryable(err)) {
        throw err;
      }
      await sleep(delayMs);
      delayMs *= 2;
    }
  }

  throw lastError;
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof RetryableError) {
    return true;
  }
  return err instanceof TypeError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
