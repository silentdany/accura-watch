export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message);
  }
}

/** fetch + timeout + JSON parse, throwing a readable error on non-2xx. */
export async function fetchJson<T>(
  url: string | URL,
  init: RequestInit & { timeoutMs?: number; label?: string } = {},
): Promise<{ data: T; headers: Headers }> {
  const { timeoutMs = 20_000, label = "request", ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let detail = text.slice(0, 240);
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const m =
        (j.error as { message?: string } | undefined)?.message ??
        (j.detail as string | undefined) ??
        (j.error_description as string | undefined) ??
        (typeof j.error === "string" ? j.error : undefined);
      if (m) detail = String(m);
    } catch {
      /* keep raw text */
    }
    throw new HttpError(`${label} ${res.status}: ${detail}`, res.status, text);
  }
  try {
    return { data: (text ? JSON.parse(text) : null) as T, headers: res.headers };
  } catch {
    throw new HttpError(`${label}: response is not JSON`, res.status, text);
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown error";
}

/** Run async tasks with bounded concurrency. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
