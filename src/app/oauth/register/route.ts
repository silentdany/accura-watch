import { OAUTH_CORS, oauthJson, registerClient } from "@/lib/oauth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return oauthJson(await registerClient(body), OAUTH_CORS);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
