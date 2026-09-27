import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Paths that authenticate themselves (Bearer token / cron secret) or are public. */
const PUBLIC = ["/login", "/api/auth", "/api/cron", "/api/mcp", "/api/v1", "/llms.txt"];

/**
 * Edge filter only: cookie presence.
 * Real proof = auth.api.getSession in requireSession() (server components).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

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
