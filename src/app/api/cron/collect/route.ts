import { NextRequest, NextResponse } from "next/server";
import { connectors } from "@/lib/connectors/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CollectSummary = {
  siteId: string;
  siteName: string;
  siteUrl: string;
  results: Awaited<ReturnType<(typeof connectors)[number]["collect"]>>;
};

/**
 * Vercel Cron / manual collect endpoint.
 * Requires: Authorization: Bearer <CRON_SECRET>
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

  // V1: single mock site until Prisma Site rows exist
  const sites = [
    {
      siteId: "mock-accura",
      siteName: "Accura",
      siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://accura.dev",
    },
  ];

  const summaries: CollectSummary[] = [];

  for (const site of sites) {
    const results = (
      await Promise.all(
        connectors.map((c) =>
          c.collect({
            siteId: site.siteId,
            siteName: site.siteName,
            siteUrl: site.siteUrl,
          }),
        ),
      )
    ).flat();

    summaries.push({ ...site, results });
  }

  return NextResponse.json({
    ok: true,
    collectedAt: new Date().toISOString(),
    connectors: connectors.map((c) => c.id),
    sites: summaries,
  });
}
