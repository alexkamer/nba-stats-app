// Espn-only mode has no DB to persist results to, and some live-only
// helpers below make dozens of ESPN calls (full roster/standings sweeps) —
// this cache keeps repeated page loads from re-paying that cost every time.
const store = new Map<string, { value: unknown; expiresAt: number }>();

export async function cachedEspn<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }
  const value = await fn();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
