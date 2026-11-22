/**
 * Schema sync run by `vercel-build` (and usable locally: `npm run db:sync`).
 * - No DATABASE_URL → skip.
 * - On Vercel, only production builds touch the database. Preview and development
 *   builds skip before any connection: they share production's DATABASE_URL, so a
 *   preview branch must never push its schema there (and each connection would wake
 *   a scale-to-zero database).
 * - v0.1 schema detected (Site.config column) → migrate-from-v1.sql, then
 *   `db push --accept-data-loss` (drops Site.config + MetricSnapshot).
 * - Otherwise plain `db push`: additive changes apply, destructive ones fail
 *   the build instead of silently losing data.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Why the sync is skipped for this environment, or null when it must run. */
export function skipReason(env) {
  if (!env.DATABASE_URL) return "DATABASE_URL not set";
  const onVercel = Boolean(env.VERCEL || env.VERCEL_ENV);
  if (onVercel && env.VERCEL_ENV !== "production") {
    return `VERCEL_ENV=${env.VERCEL_ENV || "unset"}: the schema is only synced by production builds, no database connection made`;
  }
  return null;
}

export async function dbSync({
  env = process.env,
  createPrisma = async () => new (await import("@prisma/client")).PrismaClient(),
  exec = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" }),
  log = console.log,
} = {}) {
  const reason = skipReason(env);
  if (reason) {
    log(`[db-sync] ${reason}, skipping`);
    return { synced: false, reason };
  }

  const prisma = await createPrisma();
  let legacy = false;
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'Site' AND column_name = 'config' LIMIT 1`,
    );
    legacy = Array.isArray(rows) && rows.length > 0;
    if (legacy) {
      log("[db-sync] v0.1 schema detected, migrating sites");
      const sql = readFileSync(new URL("./migrate-from-v1.sql", import.meta.url), "utf8");
      for (const stmt of splitSql(sql)) await prisma.$executeRawUnsafe(stmt);
    }
  } finally {
    await prisma.$disconnect();
  }

  const args = ["prisma", "db", "push", "--skip-generate", ...(legacy ? ["--accept-data-loss"] : [])];
  log(`[db-sync] npx ${args.join(" ")}`);
  exec("npx", args);
  return { synced: true, reason: null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await dbSync();
}

/** Split on `;` at line end, keeping $$ … $$ blocks intact and dropping comments. */
function splitSql(sql) {
  const out = [];
  let cur = "";
  let inDollar = false;
  for (const line of sql.split("\n")) {
    if (!inDollar && /^\s*--/.test(line)) continue;
    cur += line + "\n";
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;\s*$/.test(line)) {
      if (cur.trim()) out.push(cur.trim().replace(/;$/, ""));
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
