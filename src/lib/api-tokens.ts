import { prisma } from "@/lib/prisma";
import { randomToken, sha256 } from "@/lib/crypto";
import { auth } from "@/lib/auth";

export async function createApiToken(name: string): Promise<{ id: string; token: string }> {
  const token = randomToken("aw");
  const row = await prisma.apiToken.create({
    data: { name: name.trim() || "token", prefix: token.slice(0, 10), tokenHash: sha256(token) },
  });
  return { id: row.id, token };
}

export async function revokeApiToken(id: string): Promise<void> {
  await prisma.apiToken.deleteMany({ where: { id } });
}

export async function verifyApiToken(token: string): Promise<boolean> {
  if (!token.startsWith("aw_")) return false;
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row) return false;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return true;
}

/**
 * Accepts `Authorization: Bearer aw_...`, `?key=aw_...` (for MCP clients that
 * can't send headers) or a logged-in browser session.
 */
export async function authorizeRequest(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization");
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const key = bearer ?? new URL(req.url).searchParams.get("key");
  if (key) return verifyApiToken(key);
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  return !!session;
}
