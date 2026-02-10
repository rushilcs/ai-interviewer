/**
 * In-memory rate limit: 10 runs per minute per key (e.g. per interview or invite).
 */

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function prune(key: string, now: number): void {
  const list = hits.get(key) ?? [];
  const kept = list.filter((t) => now - t < WINDOW_MS);
  if (kept.length === 0) hits.delete(key);
  else hits.set(key, kept);
}

export function checkRateLimit(keyId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  prune(keyId, now);
  const list = hits.get(keyId) ?? [];
  if (list.length >= MAX_PER_WINDOW) {
    const oldest = list[0];
    return { allowed: false, retryAfterSeconds: Math.ceil((oldest + WINDOW_MS - now) / 1000) };
  }
  list.push(now);
  hits.set(keyId, list);
  return { allowed: true };
}
