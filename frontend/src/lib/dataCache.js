// Lightweight shared cache for reference data (users, clients, departments,
// etc.) that many pages/components independently re-fetch on mount and on
// every polling tick. Call `fetchCached(key, fetcher)` wherever a page would
// normally do `axios.get(...)` for one of these resources - within the TTL
// window, all callers share one in-flight request and one cached result
// instead of each firing its own network call.
//
// This intentionally stays a plain module-level cache (no React state) so it
// can be dropped into existing fetch functions without restructuring how
// each page stores its own data.

const DEFAULT_TTL_MS = 30000;

const cache = new Map(); // key -> { data, expiresAt, inFlight }

export async function fetchCached(key, fetcher, ttlMs = DEFAULT_TTL_MS) {
  const entry = cache.get(key);
  const now = Date.now();

  if (entry) {
    if (entry.inFlight) {
      return entry.inFlight;
    }
    if (entry.expiresAt > now) {
      return entry.data;
    }
  }

  const inFlight = fetcher()
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + ttlMs, inFlight: null });
      return data;
    })
    .catch((err) => {
      // Don't cache failures - clear so the next call retries fresh.
      cache.delete(key);
      throw err;
    });

  cache.set(key, { data: entry?.data, expiresAt: 0, inFlight });
  return inFlight;
}

export function invalidateCache(key) {
  cache.delete(key);
}

export function invalidateAllCache() {
  cache.clear();
}

export default fetchCached;
