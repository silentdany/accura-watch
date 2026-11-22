/**
 * Security behaviour against a real Postgres (DATABASE_URL, schema from `prisma db push`).
 * Never point this at a database you care about: every test empties the tables it uses.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { authorizeRequest, createApiToken } from "@/lib/api-tokens";
import { exchangeToken, mcpResource, verifyOauthAccess } from "@/lib/oauth/server";
import { pkceS256 } from "@/lib/oauth/checks";
import { randomToken, sha256 } from "@/lib/crypto";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

// No Data Cache outside a Next.js server: every lookup reaches the database, which is what these tests check.
vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(cb: (...args: A) => Promise<R>) => cb,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

const BASE = "http://localhost:3000";

async function reset() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "session", "account", "verification", "user", "ApiToken", "OauthGrant", "OauthCode", "OauthClient" CASCADE',
  );
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

function signUp(i: number): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email: `owner${i}@example.com`, password: "correct-horse-battery", name: `owner${i}` }),
    }),
  );
}

describe("owner sign-up", () => {
  it.each([2, 5])("creates exactly one owner when %i sign-ups race on an empty instance", async (racers) => {
    for (let round = 0; round < 5; round++) {
      await reset();
      const responses = await Promise.all(Array.from({ length: racers }, (_, i) => signUp(round * 10 + i)));
      const statuses = responses.map((r) => r.status);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.account.count()).toBe(1);
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.filter((s) => s === 403)).toHaveLength(racers - 1);
      expect(await prisma.verification.count()).toBe(0);
    }
  }, 60_000);

  it("refuses a later sign-up once the owner exists", async () => {
    expect((await signUp(1)).status).toBe(200);
    expect((await signUp(2)).status).toBe(403);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("authorization code replay (RFC 6749 §4.1.2)", () => {
  async function codeFor(clientId: string, redirectUri: string, verifier: string): Promise<string> {
    const code = randomToken("awcode");
    await prisma.oauthCode.create({
      data: {
        codeHash: sha256(code),
        clientId,
        redirectUri,
        codeChallenge: pkceS256(verifier),
        resource: mcpResource(),
        scope: "mcp offline_access",
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return code;
  }

  it("revokes the tokens issued with a code when that code is used again", async () => {
    const clientId = "client-replay";
    const redirectUri = "http://127.0.0.1:33418/callback";
    await prisma.oauthClient.create({
      data: { id: clientId, name: "Replay test", redirectUris: [redirectUri], grantTypes: ["authorization_code", "refresh_token"], responseTypes: ["code"] },
    });
    const verifier = "v".repeat(64);
    const code = await codeFor(clientId, redirectUri, verifier);
    const params = () =>
      new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier });

    const first = await exchangeToken(params());
    expect("body" in first && first.status).toBe(200);
    const { access_token: access, refresh_token: refresh } = (first as { body: Record<string, string> }).body;
    expect(await verifyOauthAccess(access, mcpResource())).toBe(true);

    // A token from an unrelated code must survive the replay.
    const otherCode = await codeFor(clientId, redirectUri, verifier);
    const other = await exchangeToken(
      new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code: otherCode, redirect_uri: redirectUri, code_verifier: verifier }),
    );
    const otherAccess = (other as { body: Record<string, string> }).body.access_token;

    const replay = await exchangeToken(params());
    expect(replay).toMatchObject({ error: "invalid_grant", status: 400 });

    expect(await verifyOauthAccess(access, mcpResource())).toBe(false);
    const refreshed = await exchangeToken(new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: refresh }));
    expect(refreshed).toMatchObject({ error: "invalid_grant" });
    expect(await verifyOauthAccess(otherAccess, mcpResource())).toBe(true);
  });
});

describe("API token in ?key=", () => {
  it("still opens the API, logs the use without the token, and the response is marked deprecated", async () => {
    const { token } = await createApiToken("query client");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const viaQuery = new Request(`${BASE}/api/mcp?key=${token}`, { headers: { "user-agent": "legacy-client/1.0" } });
      expect(await authorizeRequest(viaQuery)).toBe("ok");
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]?.[0]);
      expect(line).toContain("deprecated ?key=");
      expect(line).toContain("/api/mcp");
      expect(line).toContain("legacy-client/1.0");
      expect(line).not.toContain(token);
      expect(line).not.toContain(token.slice(3, 13));

      warn.mockClear();
      const viaHeader = new Request(`${BASE}/api/mcp`, { headers: { authorization: `Bearer ${token}` } });
      expect(await authorizeRequest(viaHeader)).toBe("ok");
      expect(await authorizeRequest(new Request(`${BASE}/api/mcp?key=aw_unknown_token_000000`))).toBe("invalid");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }

    const marked = await middleware(new NextRequest(`${BASE}/api/v1/tools/get_overview?key=${token}`));
    expect(marked.headers.get("deprecation")).toBe("@1795305600");
    expect(marked.headers.get("link")).toContain('rel="deprecation"');
    const clean = await middleware(new NextRequest(`${BASE}/api/v1/tools/get_overview`));
    expect(clean.headers.get("deprecation")).toBeNull();
  });
});
