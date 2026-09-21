import { NextResponse } from "next/server";

/** Liveness for the Watch app itself. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "accura-watch",
    ts: new Date().toISOString(),
  });
}
