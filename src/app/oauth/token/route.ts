import { exchangeToken, OAUTH_CORS, oauthJson } from "@/lib/oauth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const params = new URLSearchParams();
    if (json) for (const [key, value] of Object.entries(json)) if (typeof value === "string") params.set(key, value);
    return params;
  }
  return new URLSearchParams(await req.text());
}

export async function POST(req: Request) {
  return oauthJson(await exchangeToken(await readParams(req)), OAUTH_CORS);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
