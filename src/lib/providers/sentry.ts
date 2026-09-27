import { fetchJson, HttpError } from "@/lib/http";
import { getSentryCreds, type SentryCreds } from "@/lib/integrations";

async function creds(): Promise<SentryCreds> {
  const c = await getSentryCreds();
  if (!c) throw new Error("Sentry is not connected");
  return c;
}

async function sentry<T>(c: SentryCreds, path: string): Promise<{ data: T; headers: Headers }> {
  try {
    return await fetchJson<T>(`${c.host}/api/0${path}`, {
      headers: { Authorization: `Bearer ${c.token}` },
      label: "Sentry",
    });
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
      const endpoint = path.split("?")[0];
      const hint = c.token.startsWith("sntrys_")
        ? "This is an Organization token, which can't read issues or stats — create a User Auth Token (Settings → Account → Personal Tokens) with org:read, project:read, event:read."
        : `Check the token scopes (org:read, project:read, event:read) and that org "${c.org}" is correct.`;
      throw new Error(`Sentry ${err.status} on ${endpoint} (org "${c.org}"). ${hint}`);
    }
    throw err;
  }
}

export type SentryProject = { id: string; slug: string; name: string; platform: string | null };

export async function listSentryProjects(): Promise<SentryProject[]> {
  const c = await creds();
  const { data } = await sentry<{ id: string; slug: string; name: string; platform?: string | null }[]>(
    c,
    `/organizations/${encodeURIComponent(c.org)}/projects/?per_page=100`,
  );
  return data.map((p) => ({ id: p.id, slug: p.slug, name: p.name, platform: p.platform ?? null }));
}

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  count: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
};

export async function listSentryIssues(
  project: string,
  opts: { query?: string; limit?: number; statsPeriod?: string; sort?: string } = {},
): Promise<{ total: number; issues: SentryIssue[] }> {
  const c = await creds();
  const params = new URLSearchParams({
    query: opts.query ?? "is:unresolved",
    statsPeriod: opts.statsPeriod ?? "14d",
    sort: opts.sort ?? "freq",
    limit: String(Math.min(opts.limit ?? 10, 100)),
  });
  const { data, headers } = await sentry<
    {
      id: string;
      shortId: string;
      title: string;
      culprit?: string;
      level: string;
      count: string;
      userCount: number;
      firstSeen: string;
      lastSeen: string;
      permalink: string;
    }[]
  >(c, `/projects/${encodeURIComponent(c.org)}/${encodeURIComponent(project)}/issues/?${params}`);
  const hits = Number.parseInt(headers.get("X-Hits") ?? "", 10);
  return {
    total: Number.isFinite(hits) ? hits : data.length,
    issues: data.map((i) => ({
      id: i.id,
      shortId: i.shortId,
      title: i.title,
      culprit: i.culprit ?? null,
      level: i.level,
      count: Number(i.count) || 0,
      userCount: i.userCount ?? 0,
      firstSeen: i.firstSeen,
      lastSeen: i.lastSeen,
      permalink: i.permalink,
    })),
  };
}

/** Accepted error events per day for the last `days` days. */
export async function sentryDailyEvents(project: string, days = 30): Promise<{ date: string; value: number }[]> {
  const c = await creds();
  const { data: proj } = await sentry<{ id: string }>(
    c,
    `/projects/${encodeURIComponent(c.org)}/${encodeURIComponent(project)}/`,
  );
  const params = new URLSearchParams({
    field: "sum(quantity)",
    groupBy: "outcome",
    category: "error",
    interval: "1d",
    statsPeriod: `${days}d`,
    project: proj.id,
  });
  const { data } = await sentry<{
    intervals: string[];
    groups: { by: { outcome?: string }; series: Record<string, number[]> }[];
  }>(c, `/organizations/${encodeURIComponent(c.org)}/stats_v2/?${params}`);
  const accepted = data.groups.find((g) => g.by.outcome === "accepted");
  const series = accepted?.series["sum(quantity)"] ?? [];
  return data.intervals.map((iso, i) => ({ date: iso.slice(0, 10), value: series[i] ?? 0 }));
}
