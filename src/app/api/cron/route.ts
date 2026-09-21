import { NextResponse } from "next/server";
import { stubConnector } from "@/lib/connectors/stub";
import { SITES } from "@/lib/sites";
import { saveSnapshot } from "@/lib/snapshots";

/**
 * Vercel Cron stub — protect with CRON_SECRET (Authorization: Bearer …).
 * Schedule in vercel.json when ready.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results = [];
  for (const site of SITES) {
    const snap = await stubConnector.fetchMetrics(site.id);
    saveSnapshot(snap);
    results.push(snap);
  }

  return NextResponse.json({ ok: true, refreshed: results.length, results });
}
