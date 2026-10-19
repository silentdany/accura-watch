import { authorizationServerMetadata, OAUTH_CORS } from "@/lib/oauth/server";

export const dynamic = "force-dynamic";

/** RFC 8414 authorization server metadata. Rewritten from `/.well-known/oauth-authorization-server`. */
export function GET() {
  return Response.json(authorizationServerMetadata(), {
    headers: { ...OAUTH_CORS, "Cache-Control": "public, max-age=300" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
