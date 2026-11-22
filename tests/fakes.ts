/**
 * Test doubles for the two things that decide whether the database wakes up:
 * the Next.js Data Cache (next/cache) and the Prisma client.
 */

type Entry = { body: string; tags: string[] };

/** In-memory Data Cache with the same contract as unstable_cache: JSON round trip on hit, tags drop entries. */
export const dataCache = {
  entries: new Map<string, Entry>(),
  revalidatedTags: [] as string[],
  reset() {
    this.entries.clear();
    this.revalidatedTags = [];
  },
};

export const nextCache = {
  unstable_cache<A extends unknown[], R>(cb: (...args: A) => Promise<R>, keyParts: string[] = [], opts: { tags?: string[] } = {}) {
    return async (...args: A): Promise<R> => {
      const key = JSON.stringify([keyParts, args]);
      const hit = dataCache.entries.get(key);
      if (hit) return JSON.parse(hit.body) as R;
      const result = await cb(...args);
      dataCache.entries.set(key, { body: JSON.stringify(result), tags: opts.tags ?? [] });
      return result;
    };
  },
  revalidateTag(tag: string) {
    dataCache.revalidatedTags.push(tag);
    for (const [key, entry] of dataCache.entries) if (entry.tags.includes(tag)) dataCache.entries.delete(key);
  },
  revalidatePath() {},
};

type Impl = (args: unknown) => unknown;

/** Prisma stand-in: every `prisma.model.method(...)` call is recorded, so a test can assert "no query". */
export const db = {
  calls: [] as string[],
  impl: new Map<string, Impl>(),
  reset() {
    this.calls = [];
    this.impl.clear();
  },
  on(name: string, fn: Impl) {
    this.impl.set(name, fn);
  },
};

function defaultResult(method: string): unknown {
  if (method === "count") return 0;
  if (method.endsWith("Many") && method.startsWith("find")) return [];
  if (method.endsWith("Many")) return { count: 0 };
  return null;
}

export const prisma: unknown = new Proxy(
  {},
  {
    get(_t, model: string) {
      if (model === "then") return undefined;
      return new Proxy(
        {},
        {
          get(_m, method: string) {
            if (method === "then") return undefined;
            return async (args: unknown) => {
              const name = `${model}.${method}`;
              db.calls.push(name);
              const fn = db.impl.get(name);
              return fn ? fn(args) : defaultResult(method);
            };
          },
        },
      );
    },
  },
);
