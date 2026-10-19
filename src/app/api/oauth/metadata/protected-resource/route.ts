import { OAUTH_CORS, protectedResourceMetadata } from "@/lib/oauth/server";

export const dynamic = "force-dynamic";

/** RFC 9728 protected resource metadata. Rewritten from `/.well-known/oauth-protected-resource`. */
export function GET() {
  return Response.json(protectedResourceMetadata(), {
    headers: { ...OAUTH_CORS, "Cache-Control": "public, max-age=300" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
