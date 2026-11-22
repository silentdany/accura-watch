import { prisma } from "@/lib/prisma";
import { randomToken, sha256 } from "@/lib/crypto";
import { auth } from "@/lib/auth";
import { mcpResource, verifyOauthAccess } from "@/lib/oauth/server";
import { CACHE_TAGS, HOUR_MS, cachedPerWindow, invalidate } from "@/lib/cache";

export async function createApiToken(name: string): Promise<{ id: string; token: string }> {
  const token = randomToken("aw");
  const row = await prisma.apiToken.create({
    data: { name: name.trim() || "token", prefix: token.slice(0, 10), tokenHash: sha256(token) },
  });
  return { id: row.id, token };
}

export async function revokeApiToken(id: string): Promise<void> {
  await prisma.apiToken.deleteMany({ where: { id } });
  invalidate(CACHE_TAGS.apiTokens);
}

/**
 * Database check for one token hash. Cached for the current UTC hour, so an agent
 * polling every few minutes does not wake the database; `lastUsedAt` is therefore
 * accurate to the hour. Revoking a token drops the cache at once.
 */
const lookupApiToken = cachedPerWindow(
  "api-token-v1",
  async (tokenHash: string): Promise<{ id: string } | null> => {
    const row = await prisma.apiToken.findUnique({ where: { tokenHash } });
    if (!row) return null;
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
      await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    }
    return { id: row.id };
  },
  { windowMs: HOUR_MS, tags: [CACHE_TAGS.apiTokens] },
);

export async function verifyApiToken(token: string): Promise<boolean> {
  if (!token.startsWith("aw_")) return false;
  return (await lookupApiToken(sha256(token))) !== null;
}

export type AuthResult = "ok" | "missing" | "invalid";

/**
 * API tokens (`aw_…`, including `?key=` for clients that can't send headers) and a
 * browser session open every API. OAuth access tokens (`awoa_…`) only open the MCP
 * resource they were issued for, and are never accepted from the query string.
 */
export async function authorizeRequest(req: Request, opts?: { resource?: string }): Promise<AuthResult> {
  const header = req.headers.get("authorization");
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const queryKey = new URL(req.url).searchParams.get("key") ?? "";
  const token = bearer || queryKey;
  if (token.startsWith("awoa_") || token.startsWith("awor_")) {
    if (!bearer || queryKey || !opts?.resource) return "invalid";
    return (await verifyOauthAccess(bearer, opts.resource)) ? "ok" : "invalid";
  }
  if (token) return (await verifyApiToken(token)) ? "ok" : "invalid";
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  return session ? "ok" : "missing";
}

/** MCP calls: OAuth tokens must target this server. */
export function authorizeMcp(req: Request): Promise<AuthResult> {
  return authorizeRequest(req, { resource: mcpResource() });
}
