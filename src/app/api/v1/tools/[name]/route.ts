import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-tokens";
import { callTool, findTool } from "@/lib/mcp/tools";
import { errorMessage } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  if (!(await authorizeRequest(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name } = await ctx.params;
  if (!findTool(name)) return NextResponse.json({ error: `Unknown tool: ${name}` }, { status: 404 });
  const args = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ ok: true, result: await callTool(name, args) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 400 });
  }
}
