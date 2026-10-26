import { createLimiter, withBackoff, DEFAULT_CONCURRENCY } from "./rate-limiter";

/**
 * THE single ESPN HTTP client. Every call to ESPN — from ingestion scripts
 * and from the webapp's live-proxy routes — goes through this module, so one
 * shared limiter actually limits everything combined. See SPEC.md Sec 4 and
 * PLAN.md Sec 2.
 */

class EspnHttpError extends Error {
  status: number;
  retryAfterMs?: number;

  constructor(status: number, url: string, retryAfterMs?: number) {
    super(`ESPN request failed: ${status} ${url}`);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

let limiter = createLimiter(DEFAULT_CONCURRENCY);

/** Allows M2 tuning (and tests) to override concurrency at runtime. */
export function setEspnConcurrency(concurrency: number) {
  limiter = createLimiter(concurrency);
}

function parseRetryAfter(res: Response): number | undefined {
  const header = res.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

async function rawFetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new EspnHttpError(res.status, url, parseRetryAfter(res));
  }
  return (await res.json()) as T;
}

/**
 * Fetch JSON from an ESPN endpoint through the shared concurrency limiter,
 * retrying on 429/5xx with exponential backoff + jitter.
 */
export async function fetchEspnJson<T>(url: string): Promise<T> {
  return limiter(() =>
    withBackoff<T>(
      () => rawFetchJson<T>(url),
      (err) => err instanceof EspnHttpError && (err.status === 429 || err.status >= 500),
      (err) => (err instanceof EspnHttpError ? err.retryAfterMs : undefined),
    ),
  );
}

export { EspnHttpError };
