// Minimal in-memory sliding-window limiter, no external dependency.
// Good enough for a single-process MVP; swap for Redis if you scale out.
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> timestamps[]

  function allow(key) {
    const now = Date.now();
    const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (timestamps.length >= max) {
      hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    hits.set(key, timestamps);
    return true;
  }

  // Periodic sweep so the map doesn't grow unbounded from one-off visitors.
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((t) => now - t < windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }, windowMs).unref();

  return { allow };
}
