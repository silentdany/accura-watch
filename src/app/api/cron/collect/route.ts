import { NextRequest, NextResponse } from "next/server";
import { connectors } from "@/lib/connectors/registry";
import { prisma } from "@/lib/prisma";
import { parseSiteConfig } from "@/lib/site-config";
import { ensureWatchedSites } from "@/lib/seed-site";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CollectSummary = {
  siteId: string;
  siteName: string;
  siteUrl: string;
  written: number;
  results: Awaited<ReturnType<(typeof connectors)[number]["collect"]>>;
};

/**
 * Vercel Cron / manual collect endpoint.
 * Requires: Authorization: Bearer <CRON_SECRET>
 * Reads active Sites from Prisma, runs connectors, writes MetricSnapshot rows.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await ensureWatchedSites();

  const sites = await prisma.site.findMany({
    where: { active: true },
    orderBy: { slug: "asc" },
  });

  const summaries: CollectSummary[] = [];

  for (const site of sites) {
    const siteConfig = parseSiteConfig(site.config);
    const results = (
      await Promise.all(
        connectors.map((c) =>
          c.collect({
            siteId: site.id,
            siteName: site.name,
            siteUrl: site.url,
            siteConfig,
          }),
        ),
      )
    ).flat();

    let written = 0;
    for (const result of results) {
      await prisma.metricSnapshot.create({
        data: {
          siteId: site.id,
          source: result.source,
          key: result.key,
          value: result.value ?? null,
          valueText: result.valueText ?? null,
          meta: (result.meta ??
            (result.error
              ? { error: result.error, ok: result.ok }
              : { ok: result.ok })) as Prisma.InputJsonValue,
        },
      });
      written += 1;
    }

    summaries.push({
      siteId: site.id,
      siteName: site.name,
      siteUrl: site.url,
      written,
      results,
    });
  }

  return NextResponse.json({
    ok: true,
    collectedAt: new Date().toISOString(),
    connectors: connectors.map((c) => c.id),
    sites: summaries,
  });
}
