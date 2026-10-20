import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/http";
import { normalizeDomain } from "@/lib/domain";
import { getOpenSeoCreds, saveIntegration, type OpenSeoCreds } from "@/lib/integrations";

/**
 * Hosted OpenSEO (https://app.openseo.so) bills a shared credit pool:
 * 1 000 credits = 1 USD (AUTUMN_SEO_DATA_CREDITS_PER_USD). The $10 plan
 * includes about $10 of those credits per month. Watch talks to the MCP
 * server only — there is no separate REST product API.
 *
 * A collect does at most two paid tools per site, and only when the
 * month-to-date ledger is under the cap stored on the integration:
 *   1. get_domain_overview — organic traffic and keyword count (cached 12 h
 *      upstream, documented at about 100–300 credits).
 *   2. get_backlinks_overview — backlinks, referring domains, and the new/lost
 *      series already included in that tool (documented at about 50 credits).
 * History, competitors and keyword volumes are not called.
 * whoami is free and is how a call's real cost is measured.
 */

export const CREDITS_PER_USD = 1000;
const MCP_URL_DEFAULT = "https://app.openseo.so/mcp";
const PROTOCOL = "2025-06-18";
/** Drop an unfinished hold after this long so a crashed collect cannot block the month. */
const RESERVE_TTL_MS = 15 * 60_000;
/**
 * Credits held against the cap while a call is in flight. The high end of the
 * range OpenSEO documents for that tool, replaced by the measured delta after.
 */
const RESERVE_CREDITS: Record<string, number> = {
  get_domain_overview: 300,
  get_backlinks_overview: 80,
};

export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_USD;
}

/** True when a stored cap exists and month-to-date spend has reached it. */
export function capReached(spentUsd: number, capUsd: number | null): boolean {
  return capUsd != null && spentUsd >= capUsd - 1e-9;
}

/** Credits consumed between two whoami readings. Null when either side is missing. A rising balance (reset, top-up) counts as 0. */
export function creditDelta(before: number | null, after: number | null): number | null {
  if (before == null || after == null) return null;
  if (after > before) return 0;
  return before - after;
}

export function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export class OpenSeoCapError extends Error {
  constructor(spentUsd: number, capUsd: number) {
    super(
      `OpenSEO monthly cap reached ($${spentUsd.toFixed(2)} of $${capUsd.toFixed(2)}). Raise it in Settings → OpenSEO.`,
    );
    this.name = "OpenSeoCapError";
  }
}

export type RpcMessage = {
  id?: number | string | null;
  result?: unknown;
  error?: { message?: string };
};

/** JSON body or an SSE stream of `data:` JSON-RPC messages. Picks the message that carries a result or an error. */
export function parseMcpBody(contentType: string | null, text: string): RpcMessage {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const sse = (contentType ?? "").includes("text/event-stream") || /(^|\n)data:/i.test(text);
  if (!sse) return JSON.parse(trimmed) as RpcMessage;
  const messages: RpcMessage[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      messages.push(JSON.parse(payload) as RpcMessage);
    } catch {
      /* keepalive or a partial chunk */
    }
  }
  const found = [...messages].reverse().find((m) => m.result !== undefined || m.error !== undefined);
  if (!found) throw new Error("OpenSEO: empty event stream");
  return found;
}

/** Throws with the tool's own text when the call failed. Returns structuredContent (possibly empty). */
export function toolStructured(message: RpcMessage): Record<string, unknown> {
  if (message.error) throw new Error(`OpenSEO: ${message.error.message || "request failed"}`);
  const result = message.result as
    | { isError?: boolean; content?: { text?: string }[]; structuredContent?: Record<string, unknown> }
    | undefined;
  if (!result || typeof result !== "object") throw new Error("OpenSEO: empty response");
  if (result.isError) {
    const text = (result.content ?? []).map((c) => c.text).filter(Boolean).join("\n");
    throw new Error(text || "OpenSEO tool error");
  }
  if (!result.structuredContent) throw new Error("OpenSEO: response had no structured data");
  return result.structuredContent;
}

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function walk(value: unknown, visit: (o: Record<string, unknown>) => boolean, depth = 0): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || depth > 5) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walk(item, visit, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const o = value as Record<string, unknown>;
  if (visit(o)) return o;
  for (const child of Object.values(o)) {
    const found = walk(child, visit, depth + 1);
    if (found) return found;
  }
  return null;
}

export type OverviewMetrics = {
  keywords: number | null;
  etv: number | null;
  backlinks: number | null;
  referringDomains: number | null;
};

export function overviewMetrics(structured: Record<string, unknown>): OverviewMetrics {
  const node = walk(structured, (o) => "organicKeywords" in o || "organicTraffic" in o) ?? structured;
  return {
    keywords: numOrNull(node.organicKeywords),
    etv: numOrNull(node.organicTraffic),
    backlinks: numOrNull(node.backlinks),
    referringDomains: numOrNull(node.referringDomains),
  };
}

export type BacklinkProfile = {
  backlinks: number | null;
  referringDomains: number | null;
  spamScore: number | null;
  brokenBacklinks: number | null;
};

export type BacklinkDay = {
  date: string;
  newBacklinks: number;
  lostBacklinks: number;
  newReferringDomains: number;
  lostReferringDomains: number;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function backlinkPayload(structured: Record<string, unknown>): { profile: BacklinkProfile | null; days: BacklinkDay[] } {
  const summaryHolder = walk(structured, (o) => {
    const s = o.summary;
    return !!s && typeof s === "object" && ("backlinks" in (s as object) || "referringDomains" in (s as object));
  });
  const summary = (summaryHolder?.summary ?? null) as Record<string, unknown> | null;
  const profile = summary
    ? {
        backlinks: numOrNull(summary.backlinks),
        referringDomains: numOrNull(summary.referringDomains),
        spamScore: numOrNull(summary.backlinksSpamScore),
        brokenBacklinks: numOrNull(summary.brokenBacklinks),
      }
    : null;
  const trendsHolder = walk(structured, (o) => Array.isArray(o.newLostTrends));
  const days: BacklinkDay[] = [];
  const rows = trendsHolder?.newLostTrends;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const date = String(r.date ?? "").slice(0, 10);
      if (!DAY.test(date)) continue;
      days.push({
        date,
        newBacklinks: numOrNull(r.newBacklinks) ?? 0,
        lostBacklinks: numOrNull(r.lostBacklinks) ?? 0,
        newReferringDomains: numOrNull(r.newReferringDomains) ?? 0,
        lostReferringDomains: numOrNull(r.lostReferringDomains) ?? 0,
      });
    }
  }
  const empty = profile && profile.backlinks == null && profile.referringDomains == null && profile.spamScore == null && profile.brokenBacklinks == null;
  return { profile: empty ? null : profile, days };
}

export type OpenSeoCallView = {
  id: string;
  at: string;
  domain: string;
  tool: string;
  credits: number;
  usd: number;
  ok: boolean;
  detail: string | null;
};

export type OpenSeoUsage = {
  connected: boolean;
  monthlyCapUsd: number | null;
  cadenceDays: number;
  creditsRemaining: number | null;
  remainingUsd: number | null;
  balanceCheckedAt: string | null;
  monthCredits: number;
  monthUsd: number;
  monthCalls: number;
  calls: OpenSeoCallView[];
};

const emptyUsage = (): OpenSeoUsage => ({
  connected: false,
  monthlyCapUsd: null,
  cadenceDays: 30,
  creditsRemaining: null,
  remainingUsd: null,
  balanceCheckedAt: null,
  monthCredits: 0,
  monthUsd: 0,
  monthCalls: 0,
  calls: [],
});

async function releaseStaleReserves(): Promise<void> {
  await prisma.openSeoCall.deleteMany({
    where: { ok: false, detail: "reserved", at: { lt: new Date(Date.now() - RESERVE_TTL_MS) } },
  });
}

async function monthCredits(): Promise<number> {
  const agg = await prisma.openSeoCall.aggregate({
    where: { at: { gte: monthStartUtc() } },
    _sum: { credits: true },
  });
  return agg._sum.credits ?? 0;
}

export async function getOpenSeoUsage(): Promise<OpenSeoUsage> {
  const creds = await getOpenSeoCreds();
  if (!creds) return emptyUsage();
  await releaseStaleReserves().catch(() => undefined);
  const start = monthStartUtc();
  const [credits, calls, monthCalls] = await Promise.all([
    monthCredits(),
    prisma.openSeoCall.findMany({ where: { at: { gte: start } }, orderBy: { at: "desc" }, take: 12 }),
    prisma.openSeoCall.count({ where: { at: { gte: start }, NOT: { detail: "reserved" } } }),
  ]);
  return {
    connected: true,
    monthlyCapUsd: creds.monthlyCapUsd,
    cadenceDays: creds.cadenceDays,
    creditsRemaining: creds.creditsRemaining,
    remainingUsd: creds.creditsRemaining == null ? null : creditsToUsd(creds.creditsRemaining),
    balanceCheckedAt: creds.balanceCheckedAt,
    monthCredits: credits,
    monthUsd: creditsToUsd(credits),
    monthCalls,
    calls: calls.map((c) => ({
      id: c.id,
      at: c.at.toISOString(),
      domain: c.domain,
      tool: c.tool,
      credits: c.credits,
      usd: creditsToUsd(c.credits),
      ok: c.ok,
      detail: c.detail,
    })),
  };
}

let rpcId = 1;
let session: { keyTail: string; id: string } | null = null;
let balanceCache: { keyTail: string; credits: number; at: number } | null = null;
let tail: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function mcpUrl(): string {
  return (env("OPENSEO_MCP_URL") ?? MCP_URL_DEFAULT).replace(/\/+$/, "");
}

async function rpc(apiKey: string, body: Record<string, unknown>): Promise<RpcMessage> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL,
    "User-Agent": "accura-watch",
  };
  const sid = session && session.keyTail === apiKey.slice(-6) ? session.id : null;
  if (sid) headers["Mcp-Session-Id"] = sid;
  const res = await fetch(mcpUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  const nextSession = res.headers.get("mcp-session-id");
  if (nextSession) session = { keyTail: apiKey.slice(-6), id: nextSession };
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("OpenSEO rejected the API key");
    throw new Error(`OpenSEO ${res.status}: ${text.slice(0, 240) || res.statusText}`);
  }
  if (!text.trim()) return {};
  return parseMcpBody(res.headers.get("content-type"), text);
}

async function initialize(apiKey: string): Promise<void> {
  const message = await rpc(apiKey, {
    jsonrpc: "2.0",
    id: rpcId++,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "accura-watch", version: "0.2.0" },
    },
  });
  if (message.error) throw new Error(`OpenSEO: ${message.error.message || "initialize failed"}`);
  await rpc(apiKey, { jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => undefined);
}

async function toolsCall(apiKey: string, name: string, args: Record<string, unknown>, allowInit = true): Promise<Record<string, unknown>> {
  try {
    const message = await rpc(apiKey, {
      jsonrpc: "2.0",
      id: rpcId++,
      method: "tools/call",
      params: { name, arguments: args },
    });
    return toolStructured(message);
  } catch (e) {
    if (allowInit && /not initialized|session/i.test(errorMessage(e))) {
      await initialize(apiKey);
      return toolsCall(apiKey, name, args, false);
    }
    throw e;
  }
}

/** Merge a few config keys without rewriting the rest, so a collect cannot wipe a cap the user just saved. */
async function patchOpenSeoConfig(patch: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify(patch);
  const updated = await prisma.$executeRaw`
    UPDATE "Integration"
    SET config = COALESCE(config, '{}'::jsonb) || ${json}::jsonb,
        "updatedAt" = NOW()
    WHERE provider = 'openseo'
  `;
  if (updated === 0) await saveIntegration("openseo", patch, null);
}

async function rememberBalance(apiKey: string, credits: number | null): Promise<void> {
  if (credits != null) balanceCache = { keyTail: apiKey.slice(-6), credits, at: Date.now() };
  await patchOpenSeoConfig({ creditsRemaining: credits, balanceCheckedAt: new Date().toISOString() });
}

/** Free. Returns the credit balance, or null when OpenSEO has no number yet. */
async function readBalance(apiKey: string, force = false): Promise<number | null> {
  const tail6 = apiKey.slice(-6);
  if (!force && balanceCache && balanceCache.keyTail === tail6 && Date.now() - balanceCache.at < 20_000) {
    return balanceCache.credits;
  }
  const structured = await toolsCall(apiKey, "whoami", {});
  const credits = numOrNull(structured.creditsRemaining);
  await rememberBalance(apiKey, credits);
  return credits;
}

export async function refreshOpenSeoBalance(): Promise<OpenSeoUsage> {
  const creds = await getOpenSeoCreds();
  if (!creds) throw new Error("OpenSEO is not connected");
  await readBalance(creds.apiKey, true);
  return getOpenSeoUsage();
}

async function assertUnderCap(): Promise<OpenSeoCreds> {
  await releaseStaleReserves();
  const creds = await getOpenSeoCreds();
  if (!creds) throw new Error("OpenSEO is not connected");
  const spent = creditsToUsd(await monthCredits());
  if (capReached(spent, creds.monthlyCapUsd)) throw new OpenSeoCapError(spent, creds.monthlyCapUsd!);
  return creds;
}

const billedDespiteError = (message: string) => !/401|403|rejected the API key|not initialized|invalid_api_key|400/.test(message);

async function paidCall(
  apiKey: string,
  domain: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ structured: Record<string, unknown>; usd: number }> {
  await assertUnderCap();
  const reserve = RESERVE_CREDITS[tool] ?? 300;
  const row = await prisma.openSeoCall.create({
    data: { domain, tool, credits: reserve, ok: false, detail: "reserved" },
  });
  const before = await readBalance(apiKey).catch(() => null);
  try {
    const structured = await toolsCall(apiKey, tool, args);
    const after = await readBalance(apiKey, true).catch(() => null);
    const credits = creditDelta(before, after);
    await prisma.openSeoCall.update({
      where: { id: row.id },
      data: {
        credits: credits ?? reserve,
        remaining: after,
        ok: true,
        detail: credits == null ? "cost unknown" : null,
      },
    });
    return { structured, usd: creditsToUsd(credits ?? reserve) };
  } catch (e) {
    const message = errorMessage(e).slice(0, 240);
    const after = await readBalance(apiKey, true).catch(() => null);
    const credits = creditDelta(before, after);
    const keep = credits ?? (billedDespiteError(message) ? reserve : 0);
    await prisma.openSeoCall.update({
      where: { id: row.id },
      data: { credits: keep, remaining: after, ok: false, detail: message },
    });
    throw e;
  }
}

async function resolveProject(creds: OpenSeoCreds): Promise<string> {
  if (creds.projectId) return creds.projectId;
  const listed = await toolsCall(creds.apiKey, "list_projects", {});
  const projects = Array.isArray(listed.projects) ? (listed.projects as { id?: string }[]) : [];
  const existing = projects.find((p) => typeof p.id === "string" && p.id)?.id;
  if (existing) {
    await patchOpenSeoConfig({ projectId: existing });
    return existing;
  }
  const created = await toolsCall(creds.apiKey, "create_project", {
    name: "Accura Watch",
    locationCode: creds.locationCode,
    languageCode: creds.languageCode,
  });
  const project = created.project as { id?: string } | undefined;
  if (!project?.id) throw new Error("OpenSEO did not return a project id");
  await patchOpenSeoConfig({ projectId: project.id });
  return project.id;
}

export type OpenSeoDomain = {
  organic: {
    keywords: number | null;
    etv: number | null;
    top3: null;
    top10: null;
    trafficCost: null;
  } | null;
  backlinks: {
    rank: null;
    backlinks: number | null;
    referringDomains: number | null;
    referringMainDomains: null;
    spamScore: number | null;
    brokenBacklinks: number | null;
  } | null;
  backlinkDays: BacklinkDay[];
  cost: number;
  errors: string[];
};

async function collectLocked(domain: string): Promise<OpenSeoDomain> {
  const out: OpenSeoDomain = { organic: null, backlinks: null, backlinkDays: [], cost: 0, errors: [] };
  let creds: OpenSeoCreds;
  try {
    creds = await assertUnderCap();
  } catch (e) {
    out.errors.push(errorMessage(e));
    return out;
  }
  let projectId: string;
  try {
    projectId = await resolveProject(creds);
  } catch (e) {
    if (/project not found|unknown project|does not exist/i.test(errorMessage(e)) && creds.projectId) {
      await patchOpenSeoConfig({ projectId: null });
      try {
        projectId = await resolveProject({ ...creds, projectId: null });
      } catch (e2) {
        out.errors.push(errorMessage(e2));
        return out;
      }
    } else {
      out.errors.push(errorMessage(e));
      return out;
    }
  }

  try {
    const paid = await paidCall(creds.apiKey, domain, "get_domain_overview", {
      projectId,
      domain,
      locationCode: creds.locationCode,
      languageCode: creds.languageCode,
    });
    out.cost += paid.usd;
    const m = overviewMetrics(paid.structured);
    if (m.keywords != null || m.etv != null) {
      out.organic = { keywords: m.keywords, etv: m.etv, top3: null, top10: null, trafficCost: null };
    }
    if (m.backlinks != null || m.referringDomains != null) {
      out.backlinks = {
        rank: null,
        backlinks: m.backlinks,
        referringDomains: m.referringDomains,
        referringMainDomains: null,
        spamScore: null,
        brokenBacklinks: null,
      };
    }
  } catch (e) {
    out.errors.push(errorMessage(e));
    if (e instanceof OpenSeoCapError || /rejected the API key/i.test(errorMessage(e))) return out;
  }

  try {
    await assertUnderCap();
  } catch (e) {
    out.errors.push(errorMessage(e));
    return out;
  }
  try {
    const paid = await paidCall(creds.apiKey, domain, "get_backlinks_overview", { projectId, target: domain });
    out.cost += paid.usd;
    const parsed = backlinkPayload(paid.structured);
    if (parsed.profile) {
      out.backlinks = {
        rank: null,
        backlinks: parsed.profile.backlinks ?? out.backlinks?.backlinks ?? null,
        referringDomains: parsed.profile.referringDomains ?? out.backlinks?.referringDomains ?? null,
        referringMainDomains: null,
        spamScore: parsed.profile.spamScore,
        brokenBacklinks: parsed.profile.brokenBacklinks,
      };
    }
    out.backlinkDays = parsed.days;
  } catch (e) {
    out.errors.push(errorMessage(e));
  }
  return out;
}

/** One domain overview, then backlinks if the monthly cap still allows it. Serialized so the ledger stays honest. */
export async function collectOpenSeo(domain: string): Promise<OpenSeoDomain> {
  const host = normalizeDomain(domain);
  if (!host) throw new Error("Invalid domain");
  return withLock(() => collectLocked(host));
}
