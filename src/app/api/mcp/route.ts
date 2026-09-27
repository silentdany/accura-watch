import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-tokens";
import { handleMcpPayload, SERVER_INFO } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
};

function unauthorized() {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: create an API token in Settings → MCP & API" } },
    { status: 401, headers: CORS },
  );
}

/** MCP Streamable HTTP endpoint (stateless, JSON responses). */
export async function POST(req: NextRequest) {
  if (!(await authorizeRequest(req))) return unauthorized();
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const res = await handleMcpPayload(payload);
  if (res === null) return new NextResponse(null, { status: 202, headers: CORS });
  return NextResponse.json(res, { headers: CORS });
}

/** No server-initiated SSE stream in stateless mode. */
export async function GET() {
  return NextResponse.json(
    { ...SERVER_INFO, transport: "streamable-http", hint: "POST JSON-RPC messages to this URL" },
    { status: 405, headers: { ...CORS, Allow: "POST" } },
  );
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { ...CORS, Allow: "POST" } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
