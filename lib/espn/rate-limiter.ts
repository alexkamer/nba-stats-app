import pLimit from "p-limit";

/**
 * Tuned against real ESPN behavior during the M2 exploration spike
 * (PLAN.md Sec 2/Sec 3): 81 distinct real completed-game `summary` calls
 * showed 0 failures and no real slowdown up to concurrency 30; latency
 * started creeping up past 20, so 10 is the chosen default — comfortably
 * fast with headroom before any sign of throttling.
 */
export const DEFAULT_CONCURRENCY = 10;
export const DEFAULT_MAX_RETRIES = 4;
export const DEFAULT_BASE_DELAY_MS = 500;

export function createLimiter(concurrency = DEFAULT_CONCURRENCY) {
  return pLimit(concurrency);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter, honoring Retry-After when present. */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  shouldRetry: (err: unknown) => boolean,
  retryAfterMs: (err: unknown) => number | undefined,
  maxRetries = DEFAULT_MAX_RETRIES,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > maxRetries || !shouldRetry(err)) throw err;
      const explicit = retryAfterMs(err);
      const backoff = explicit ?? baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * backoff * 0.25;
      await sleep(backoff + jitter);
    }
  }
}
