import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Data Cache helpers that keep the database asleep.
 *
 * On a serverless Postgres that scales to zero (Neon), every query wakes the
 * compute for at least five minutes. Reads that agents repeat all day (token
 * checks, the portfolio overview, the login page) are served from the Next.js
 * Data Cache instead, and every write that changes them drops the matching tag.
 *
 * Entries are keyed by a time bucket as well, so an entry is never served past
 * its bucket: there is no stale-while-revalidate on these reads.
 */

export const CACHE_TAGS = {
  /** Sites, metrics, sync states and integrations: anything the overview reads. */
  data: "aw:data",
  apiTokens: "aw:api-tokens",
  oauthGrants: "aw:oauth-grants",
  owner: "aw:owner",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Index of the fixed window `now` falls in. Windows start on the UTC hour (or day). */
export function timeBucket(windowMs: number, now = Date.now()): number {
  return Math.floor(now / windowMs);
}

/** Drop cached reads after a write. Must run inside a request, route handler or server action. */
export function invalidate(...tags: CacheTag[]): void {
  for (const tag of tags) revalidateTag(tag);
}

/** Thrown inside a cached function to return `null` without storing anything. */
class NotCached extends Error {
  constructor() {
    super("not cached");
  }
}

/**
 * Cache `fn` for one time window per argument list. A `null` result is returned
 * to the caller but never stored, so a miss (unknown token, no owner yet) is
 * looked up again on the next call.
 */
export function cachedPerWindow<A extends (string | number)[], R>(
  name: string,
  fn: (...args: A) => Promise<R | null>,
  opts: { windowMs: number; tags: CacheTag[] },
): (...args: A) => Promise<R | null> {
  const cached = unstable_cache(
    async (_bucket: number, ...args: A): Promise<R> => {
      const result = await fn(...args);
      if (result === null) throw new NotCached();
      return result;
    },
    [name],
    // The bucket in the key already bounds the age; `revalidate` only lets old
    // entries expire from storage.
    { tags: opts.tags, revalidate: Math.ceil((2 * opts.windowMs) / 1000) },
  );
  return async (...args: A) => {
    try {
      return await cached(timeBucket(opts.windowMs), ...args);
    } catch (err) {
      if (err instanceof NotCached) return null;
      throw err;
    }
  };
}
