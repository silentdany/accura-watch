import { describe, expect, it, vi } from "vitest";
import { dbSync } from "../scripts/db-sync.mjs";

function harness(env: Record<string, string | undefined>) {
  const prisma = { $queryRawUnsafe: vi.fn(async () => []), $executeRawUnsafe: vi.fn(), $disconnect: vi.fn(async () => {}) };
  const createPrisma = vi.fn(async () => prisma);
  const exec = vi.fn();
  const log = vi.fn();
  return { run: () => dbSync({ env, createPrisma, exec, log } as unknown as Parameters<typeof dbSync>[0]), createPrisma, exec, prisma, log };
}

const URL = "postgresql://user@db.invalid:5432/app";

describe("db-sync on Vercel builds", () => {
  it.each(["preview", "development"])("skips on VERCEL_ENV=%s without any database connection", async (vercelEnv) => {
    const h = harness({ DATABASE_URL: URL, VERCEL: "1", VERCEL_ENV: vercelEnv });
    expect(await h.run()).toMatchObject({ synced: false });
    expect(h.createPrisma).not.toHaveBeenCalled();
    expect(h.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(h.exec).not.toHaveBeenCalled();
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining(`VERCEL_ENV=${vercelEnv}`));
  });

  it("skips on Vercel when VERCEL_ENV is missing", async () => {
    const h = harness({ DATABASE_URL: URL, VERCEL: "1" });
    expect(await h.run()).toMatchObject({ synced: false });
    expect(h.createPrisma).not.toHaveBeenCalled();
  });

  it("syncs once on VERCEL_ENV=production", async () => {
    const h = harness({ DATABASE_URL: URL, VERCEL: "1", VERCEL_ENV: "production" });
    expect(await h.run()).toMatchObject({ synced: true });
    expect(h.createPrisma).toHaveBeenCalledTimes(1);
    expect(h.prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(h.exec).toHaveBeenCalledTimes(1);
    expect(h.exec).toHaveBeenCalledWith("npx", ["prisma", "db", "push", "--skip-generate"]);
  });

  it("still runs when called by hand outside Vercel (npm run db:sync)", async () => {
    const h = harness({ DATABASE_URL: URL });
    expect(await h.run()).toMatchObject({ synced: true });
    expect(h.exec).toHaveBeenCalledTimes(1);
  });

  it("skips without DATABASE_URL", async () => {
    const h = harness({ VERCEL: "1", VERCEL_ENV: "production" });
    expect(await h.run()).toMatchObject({ synced: false });
    expect(h.createPrisma).not.toHaveBeenCalled();
  });
});
