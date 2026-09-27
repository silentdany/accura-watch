import { NextRequest, NextResponse } from "next/server";
import { runCollection } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled collection. Call as often as you like (e.g. hourly): each source
 * has its own cadence, so only due (site, source) pairs actually run.
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it automatically).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const r = await runCollection();
  return NextResponse.json({
    ok: true,
    ...r,
    results: r.results.filter((x) => x.status === "ok" || x.status === "error"),
  });
}
