import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { dataCache, db } from "./fakes";

vi.mock("next/cache", async () => (await import("./fakes")).nextCache);
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./fakes")).prisma }));
vi.mock("@/lib/metrics", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/metrics")>();
  const { prisma } = await import("@/lib/prisma");
  return {
    ...real,
    // Stands for the real loader: one query, then a result with a Date and a series.
    loadOverview: vi.fn(async (range: number) => {
      const sites = (await (prisma as unknown as { site: { findMany: () => Promise<{ slug: string }[]> } }).site.findMany()) ?? [];
      return {
        range,
        generatedAt: new Date(),
        totals: { clicks: sites.length, clicksSeries: [1, 2] },
        sites: sites.map((s) => ({ slug: s.slug, gsc: { clicks: 1, clicksSeries: [1] }, posthog: null, sentry: null })),
      };
    }),
  };
});
vi.mock("@/lib/collect", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/collect")>();
  const { prisma } = await import("@/lib/prisma");
  return {
    ...real,
    runCollection: vi.fn(async () => {
      await (prisma as unknown as { syncState: { findMany: () => Promise<unknown[]> } }).syncState.findMany();
      return { startedAt: new Date().toISOString(), durationMs: 1, results: [] };
    }),
  };
});

const { sha256 } = await import("@/lib/crypto");
const { POST: callToolRoute } = await import("@/app/api/v1/tools/[name]/route");
const { POST: mcpRoute } = await import("@/app/api/mcp/route");
const { GET: cronRoute } = await import("@/app/api/cron/collect/route");
const { POST: revokeRoute } = await import("@/app/oauth/revoke/route");
const { revokeApiToken } = await import("@/lib/api-tokens");
const { revokeOauthGrant, mcpResource } = await import("@/lib/oauth/server");
const { ownerExists } = await import("@/lib/auth");
const { loadOverview } = await import("@/lib/metrics");
const { CACHE_TAGS } = await import("@/lib/cache");

const BASE = "http://localhost:3000";
const TOKEN_A = "aw_test_token_a_000000000000000000";
const TOKEN_B = "aw_test_token_b_000000000000000000";
const ACCESS = "awoa_test_access_00000000000000000";

let apiTokens: Map<string, { id: string; lastUsedAt: Date | null }>;
type Grant = { id: string; familyId: string; resource: string; scope: string; accessExpiresAt: Date; revokedAt: Date | null; lastUsedAt: Date | null };
let grants: Map<string, Grant>;

function overviewRequest(token?: string, body: unknown = { range: 28 }) {
  return new NextRequest(`${BASE}/api/v1/tools/get_overview`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
const callOverview = (token?: string, body?: unknown) =>
  callToolRoute(overviewRequest(token, body), { params: Promise.resolve({ name: "get_overview" }) });

function mcpRequest(token: string, payload: unknown) {
  return new NextRequest(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T10:10:00Z"));
  dataCache.reset();
  db.reset();
  vi.mocked(loadOverview).mockClear();
  apiTokens = new Map([[sha256(TOKEN_A), { id: "tok_a", lastUsedAt: null }], [sha256(TOKEN_B), { id: "tok_b", lastUsedAt: null }]]);
  grants = new Map([
    [
      sha256(ACCESS),
      {
        id: "g1",
        familyId: "f1",
        resource: mcpResource(),
        scope: "mcp",
        accessExpiresAt: new Date("2026-11-22T10:40:00Z"),
        revokedAt: null,
        lastUsedAt: null,
      },
    ],
  ]);
  db.on("apiToken.findUnique", (a) => {
    const hash = (a as { where: { tokenHash: string } }).where.tokenHash;
    const row = apiTokens.get(hash);
    return row ? { ...row, tokenHash: hash } : null;
  });
  db.on("apiToken.deleteMany", (a) => {
    const id = (a as { where: { id: string } }).where.id;
    for (const [h, r] of apiTokens) if (r.id === id) apiTokens.delete(h);
    return { count: 1 };
  });
  db.on("oauthGrant.findUnique", (a) => {
    const w = (a as { where: { accessHash?: string; id?: string } }).where;
    if (w.accessHash) return grants.get(w.accessHash) ?? null;
    return [...grants.values()].find((g) => g.id === w.id) ?? null;
  });
  db.on("oauthGrant.updateMany", (a) => {
    const { where, data } = a as { where: { familyId: string }; data: { revokedAt?: Date } };
    for (const g of grants.values()) if (g.familyId === where.familyId && data.revokedAt) g.revokedAt = data.revokedAt;
    return { count: 1 };
  });
  db.on("site.findMany", () => [{ slug: "alpha" }, { slug: "beta" }]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("get_overview over REST", () => {
  it("answers a repeated call from the cache with zero database queries, auth included", async () => {
    const first = await callOverview(TOKEN_A);
    expect(first.status).toBe(200);
    expect(db.calls.length).toBeGreaterThan(0);

    db.calls = [];
    const second = await callOverview(TOKEN_A);
    expect(second.status).toBe(200);
    expect(db.calls).toEqual([]);
    expect(await second.json()).toEqual(await first.json());
    expect(loadOverview).toHaveBeenCalledTimes(1);
  });

  it("keeps the payload shape: series stripped by default, kept with include_series", async () => {
    const plain = await (await callOverview(TOKEN_A)).json();
    expect(plain.result.totals).toEqual({ clicks: 2 });
    expect(plain.result.sites[0].gsc).toEqual({ clicks: 1 });
    const full = await (await callOverview(TOKEN_A, { range: 28, include_series: true })).json();
    expect(full.result.totals.clicksSeries).toEqual([1, 2]);
  });

  it("caches per range", async () => {
    await callOverview(TOKEN_A, { range: 28 });
    await callOverview(TOKEN_A, { range: 7 });
    expect(loadOverview).toHaveBeenCalledTimes(2);
  });

  it("never serves cached data without valid credentials", async () => {
    await callOverview(TOKEN_A); // warm the cache
    for (const token of [undefined, "aw_unknown_token_0000000000000000", "not-a-token"]) {
      const res = await callOverview(token);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    }
  });

  it("checks each token on its own: a cached token does not open the door to another one", async () => {
    await callOverview(TOKEN_A);
    db.calls = [];
    expect((await callOverview(TOKEN_B)).status).toBe(200);
    expect(db.calls).toEqual(["apiToken.findUnique", "apiToken.update"]);
  });

  it("does not cache unknown tokens: a token created later is accepted at once", async () => {
    const late = "aw_test_token_late_000000000000000";
    expect((await callOverview(late)).status).toBe(401);
    apiTokens.set(sha256(late), { id: "tok_late", lastUsedAt: null });
    expect((await callOverview(late)).status).toBe(200);
  });

  it("stops accepting a revoked token immediately", async () => {
    expect((await callOverview(TOKEN_A)).status).toBe(200);
    await revokeApiToken("tok_a");
    expect(dataCache.revalidatedTags).toContain(CACHE_TAGS.apiTokens);
    expect((await callOverview(TOKEN_A)).status).toBe(401);
    expect((await callOverview(TOKEN_B)).status).toBe(200);
  });

  it("checks the token and recomputes the overview again in the next UTC hour", async () => {
    await callOverview(TOKEN_A);
    vi.setSystemTime(new Date("2026-11-22T10:59:59Z"));
    db.calls = [];
    await callOverview(TOKEN_A);
    expect(db.calls).toEqual([]);

    vi.setSystemTime(new Date("2026-11-22T11:00:01Z"));
    await callOverview(TOKEN_A);
    expect(db.calls).toContain("apiToken.findUnique");
    expect(db.calls).toContain("site.findMany");
  });

  it("recomputes after a collection run", async () => {
    await callOverview(TOKEN_A);
    const cron = await cronRoute(
      new NextRequest(`${BASE}/api/cron/collect`, { headers: { authorization: "Bearer test-only-cron-secret" } }),
    );
    expect(cron.status).toBe(200);
    expect(dataCache.revalidatedTags).toContain(CACHE_TAGS.data);
    db.calls = [];
    await callOverview(TOKEN_A);
    expect(db.calls).toEqual(["site.findMany"]);
    expect(loadOverview).toHaveBeenCalledTimes(2);
  });

  // update_site fails here (the fake database has no such site); a write tool drops the cache even when it throws.
  it("recomputes after a tool that writes, not after a read-only one", async () => {
    await callOverview(TOKEN_A);
    expect((await callOverview(TOKEN_A, { range: 7 })).status).toBe(200); // read-only tool
    expect(dataCache.revalidatedTags).toEqual([]);

    await callToolRoute(
      new NextRequest(`${BASE}/api/v1/tools/update_site`, { method: "POST", headers: { authorization: `Bearer ${TOKEN_A}` }, body: JSON.stringify({ site: "alpha", pinned: true }) }),
      { params: Promise.resolve({ name: "update_site" }) },
    );
    expect(dataCache.revalidatedTags).toEqual([CACHE_TAGS.data]);
    await callOverview(TOKEN_A);
    expect(loadOverview).toHaveBeenCalledTimes(3); // 28, 7, then 28 again after the write
  });
});

describe("MCP endpoint", () => {
  const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } };
  const toolsList = { jsonrpc: "2.0", id: 2, method: "tools/list" };

  it("serves initialize and tools/list with zero queries once the API token is cached", async () => {
    expect((await mcpRoute(mcpRequest(TOKEN_A, initialize))).status).toBe(200);
    db.calls = [];
    const a = await mcpRoute(mcpRequest(TOKEN_A, initialize));
    const b = await mcpRoute(mcpRequest(TOKEN_A, toolsList));
    expect(a.status).toBe(200);
    expect((await b.json()).result.tools.length).toBeGreaterThan(5);
    expect(db.calls).toEqual([]);
  });

  it("serves an OAuth access token from the cache, then refuses it once expired", async () => {
    expect((await mcpRoute(mcpRequest(ACCESS, initialize))).status).toBe(200);
    db.calls = [];
    expect((await mcpRoute(mcpRequest(ACCESS, toolsList))).status).toBe(200);
    expect(db.calls).toEqual([]);

    vi.setSystemTime(new Date("2026-11-22T10:40:01Z")); // same hour, past accessExpiresAt
    expect((await mcpRoute(mcpRequest(ACCESS, toolsList))).status).toBe(401);
  });

  it("refuses an OAuth access token as soon as it is revoked (RFC 7009 route or settings)", async () => {
    expect((await mcpRoute(mcpRequest(ACCESS, toolsList))).status).toBe(200);
    await revokeRoute(new Request(`${BASE}/oauth/revoke`, { method: "POST", body: `token=${ACCESS}` }));
    expect(dataCache.revalidatedTags).toContain(CACHE_TAGS.oauthGrants);
    expect((await mcpRoute(mcpRequest(ACCESS, toolsList))).status).toBe(401);

    grants.get(sha256(ACCESS))!.revokedAt = null;
    dataCache.reset();
    expect((await mcpRoute(mcpRequest(ACCESS, toolsList))).status).toBe(200);
    await revokeOauthGrant("g1");
    expect((await mcpRoute(mcpRequest(ACCESS, toolsList))).status).toBe(401);
  });

  it("does not accept an OAuth token for another resource, even when cached", async () => {
    expect((await mcpRoute(mcpRequest(ACCESS, toolsList))).status).toBe(200);
    const restCall = await callOverview(ACCESS);
    expect(restCall.status).toBe(401);
  });
});

describe("login page owner check", () => {
  it("caches 'owner exists' but never 'no owner yet'", async () => {
    db.on("user.count", () => 0);
    expect(await ownerExists()).toBeNull();
    expect(await ownerExists()).toBeNull();
    expect(db.calls.filter((c) => c === "user.count")).toHaveLength(2);

    db.on("user.count", () => 1);
    expect(await ownerExists()).toBe(true);
    db.calls = [];
    expect(await ownerExists()).toBe(true);
    expect(db.calls).toEqual([]);
  });
});
