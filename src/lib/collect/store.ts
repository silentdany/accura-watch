import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseYmd } from "@/lib/dates";

export type Point = { date: string; value: number };

/** DailyMetric key prefix for a day's top referring domains (`referrer:google.com`, `referrer:$direct`). */
export const DAILY_REFERRER_PREFIX = "referrer:";

/** Replace daily values for the given dates (idempotent re-sync of a window). */
export async function writeDaily(
  siteId: string,
  source: string,
  series: Record<string, Point[]>,
): Promise<void> {
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [key, points] of Object.entries(series)) {
    if (!points.length) continue;
    const dates = points.map((p) => parseYmd(p.date));
    ops.push(
      prisma.dailyMetric.deleteMany({ where: { siteId, source, key, date: { in: dates } } }),
      prisma.dailyMetric.createMany({
        data: points
          .filter((p) => Number.isFinite(p.value))
          .map((p) => ({ siteId, source, key, date: parseYmd(p.date), value: p.value })),
        skipDuplicates: true,
      }),
    );
  }
  if (ops.length) await prisma.$transaction(ops);
}

/**
 * Replace every key with this prefix inside a date window, then write the new points.
 * Used when the set of keys changes from day to day (a referrer that drops out of the top 5
 * must not leave a stale row behind).
 */
export async function replacePrefixedDaily(
  siteId: string,
  source: string,
  keyPrefix: string,
  from: string,
  to: string,
  series: Record<string, Point[]>,
): Promise<void> {
  const data = Object.entries(series).flatMap(([key, points]) => {
    if (!key.startsWith(keyPrefix)) return [];
    return points
      .filter((p) => Number.isFinite(p.value))
      .map((p) => ({ siteId, source, key, date: parseYmd(p.date), value: p.value }));
  });
  await prisma.$transaction([
    prisma.dailyMetric.deleteMany({
      where: { siteId, source, key: { startsWith: keyPrefix }, date: { gte: parseYmd(from), lte: parseYmd(to) } },
    }),
    ...(data.length ? [prisma.dailyMetric.createMany({ data, skipDuplicates: true })] : []),
  ]);
}

export async function writeInsight(siteId: string, source: string, kind: string, data: unknown): Promise<void> {
  const json = data as Prisma.InputJsonValue;
  await prisma.insight.upsert({
    where: { siteId_source_kind: { siteId, source, kind } },
    create: { siteId, source, kind, data: json },
    update: { data: json },
  });
}
