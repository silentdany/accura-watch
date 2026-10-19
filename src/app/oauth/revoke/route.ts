import { OAUTH_CORS, revokeOauthToken } from "@/lib/oauth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 7009. Always 200, so revoked and unknown tokens look the same. */
export async function POST(req: Request) {
  const params = new URLSearchParams(await req.text());
  await revokeOauthToken(params.get("token") ?? "");
  return new Response(null, { status: 200, headers: { ...OAUTH_CORS, "Cache-Control": "no-store" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
