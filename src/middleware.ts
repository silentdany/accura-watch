import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Paths that authenticate themselves (Bearer token / cron secret) or are public. */
const PUBLIC = ["/login", "/api/auth", "/api/cron", "/api/mcp", "/api/v1", "/api/oauth", "/oauth", "/.well-known", "/llms.txt", "/robots.txt"];

/**
 * Edge filter only: cookie presence.
 * Real proof = auth.api.getSession in requireSession() (server components).
 */
/** `?key=` tokens on the APIs still work but are deprecated (RFC 9745 / RFC 8594 headers). */
const KEY_IN_QUERY = ["/api/mcp", "/api/v1"];
const KEY_DEPRECATION_HEADERS = {
  Deprecation: "@1795305600", // 2026-11-22T00:00:00Z
  Link: '<https://github.com/silentdany/accura-watch#ai--mcp>; rel="deprecation"; type="text/html"',
};

function isUnder(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (isUnder(pathname, KEY_IN_QUERY) && searchParams.has("key")) {
    return NextResponse.next({ headers: KEY_DEPRECATION_HEADERS });
  }
  if (isUnder(pathname, PUBLIC)) return NextResponse.next();

  if (!getSessionCookie(request)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
