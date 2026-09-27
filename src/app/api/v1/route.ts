import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-tokens";
import { TOOLS, toolJsonSchema } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** REST mirror of the MCP tools: GET lists them, POST /api/v1/tools/:name calls one. */
export async function GET(req: NextRequest) {
  if (!(await authorizeRequest(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      endpoint: `/api/v1/tools/${t.name}`,
      method: "POST",
      input: toolJsonSchema(t),
    })),
  });
}
