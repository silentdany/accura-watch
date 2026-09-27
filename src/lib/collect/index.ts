import { prisma } from "@/lib/prisma";
import { errorMessage, mapLimit } from "@/lib/http";
import {
  getDataForSeoCreds,
  getGoogleCreds,
  getOpenPageRankCreds,
  getPosthogCreds,
  getSentryCreds,
} from "@/lib/integrations";
import { COLLECTORS, SOURCES, type Connected, type Source } from "./collectors";

export { SOURCES, type Source } from "./collectors";

export type CollectOptions = {
  /** Limit to these site ids (default: all active sites). */
  siteIds?: string[];
  sources?: Source[];
  /** Ignore cadence and run everything now. */
  force?: boolean;
};

export type CollectTaskResult = {
  site: string;
  source: Source;
  status: "ok" | "error" | "skipped" | "not_due";
  detail?: string;
  ms?: number;
};

export async function connectedProviders(): Promise<Connected> {
  const [google, posthog, sentry, dfs, opr] = await Promise.all([
    getGoogleCreds(),
    getPosthogCreds(),
    getSentryCreds(),
    getDataForSeoCreds(),
    getOpenPageRankCreds(),
  ]);
  return {
    google: !!google,
    posthog: !!posthog,
    sentry: !!sentry,
    dataforseo: !!dfs,
    openpagerank: !!opr,
    seoCadenceDays: dfs?.cadenceDays ?? 7,
  };
}

/**
 * Run due collectors for every (site, source) pair and record SyncState.
 * Safe to call often: cadence per source avoids hammering APIs (and paying DataForSEO twice).
 */
export async function runCollection(opts: CollectOptions = {}): Promise<{
  startedAt: string;
  durationMs: number;
  results: CollectTaskResult[];
}> {
  const started = Date.now();
  const connected = await connectedProviders();
  const sites = await prisma.site.findMany({
    where: opts.siteIds ? { id: { in: opts.siteIds } } : { active: true },
    orderBy: { name: "asc" },
  });
  const states = await prisma.syncState.findMany({
    where: { siteId: { in: sites.map((s) => s.id) } },
  });
  const stateOf = (siteId: string, source: string) =>
    states.find((s) => s.siteId === siteId && s.source === source);

  const sources = opts.sources?.length ? opts.sources : SOURCES;
  const tasks: { site: (typeof sites)[number]; source: Source }[] = [];
  const results: CollectTaskResult[] = [];

  for (const site of sites) {
    for (const source of sources) {
      const c = COLLECTORS[source];
      const reason = c.skipReason(site, connected);
      if (reason) {
        results.push({ site: site.slug, source, status: "skipped", detail: reason });
        continue;
      }
      const st = stateOf(site.id, source);
      const dueAt = st ? st.lastRunAt.getTime() + c.cadenceMinutes(connected) * 60_000 : 0;
      if (!opts.force && dueAt > Date.now()) {
        results.push({ site: site.slug, source, status: "not_due" });
        continue;
      }
      tasks.push({ site, source });
    }
  }

  const ran = await mapLimit(tasks, 6, async ({ site, source }) => {
    const t0 = Date.now();
    const prev = stateOf(site.id, source);
    const firstRun = !prev?.lastSuccessAt;
    let result: CollectTaskResult;
    try {
      const detail = await COLLECTORS[source].run(site, { firstRun });
      result = { site: site.slug, source, status: "ok", detail: detail ?? undefined };
    } catch (err) {
      result = { site: site.slug, source, status: "error", detail: errorMessage(err).slice(0, 500) };
    }
    result.ms = Date.now() - t0;
    const now = new Date();
    const ok = result.status === "ok";
    await prisma.syncState.upsert({
      where: { siteId_source: { siteId: site.id, source } },
      create: { siteId: site.id, source, lastRunAt: now, lastSuccessAt: ok ? now : null, ok, error: ok ? null : result.detail },
      update: { lastRunAt: now, ok, error: ok ? null : result.detail, ...(ok ? { lastSuccessAt: now } : {}) },
    });
    return result;
  });

  return {
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    results: [...ran, ...results],
  };
}
