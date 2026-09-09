const buckets = new Map<string, number[]>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_BUCKETS = 10_000;

function prune(key: string, now: number, windowMs: number): void {
  const bucket = buckets.get(key);
  if (bucket) {
    const kept = bucket.filter((t) => now - t < windowMs);
    if (kept.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, kept);
    }
  }
}

// In-memory sliding-window limiter (single instance; sufficient for Phase 1).
// Returns true when the request is allowed within `max` per `windowMs`.
export function rateLimit(
  key: string,
  max: number,
  windowMs: number = WINDOW_MS,
): boolean {
  if (buckets.size >= MAX_BUCKETS) {
    // Hard floor to prevent unbounded memory growth.
    buckets.delete(buckets.keys().next().value!);
  }

  const now = Date.now();
  prune(key, now, windowMs);

  const bucket = buckets.get(key) ?? [];
  if (bucket.length >= max) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.push(now);
  buckets.set(key, bucket);
  return true;
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function resetRateLimits(): void {
  buckets.clear();
}