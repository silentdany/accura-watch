/**
 * Schema sync run by `vercel-build` (and usable locally: `npm run db:sync`).
 * - No DATABASE_URL → skip.
 * - v0.1 schema detected (Site.config column) → migrate-from-v1.sql, then
 *   `db push --accept-data-loss` (drops Site.config + MetricSnapshot).
 * - Otherwise plain `db push`: additive changes apply, destructive ones fail
 *   the build instead of silently losing data.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  console.log("[db-sync] DATABASE_URL not set — skipping");
  process.exit(0);
}

const prisma = new PrismaClient();
let legacy = false;
try {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'Site' AND column_name = 'config' LIMIT 1`,
  );
  legacy = Array.isArray(rows) && rows.length > 0;
  if (legacy) {
    console.log("[db-sync] v0.1 schema detected — migrating sites");
    const sql = readFileSync(new URL("./migrate-from-v1.sql", import.meta.url), "utf8");
    for (const stmt of splitSql(sql)) await prisma.$executeRawUnsafe(stmt);
  }
} finally {
  await prisma.$disconnect();
}

const args = ["prisma", "db", "push", "--skip-generate", ...(legacy ? ["--accept-data-loss"] : [])];
console.log(`[db-sync] npx ${args.join(" ")}`);
execFileSync("npx", args, { stdio: "inherit" });

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
