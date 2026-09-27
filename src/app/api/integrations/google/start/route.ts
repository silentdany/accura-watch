import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getServerSession } from "@/lib/require-session";
import { googleAuthorizeUrl } from "@/lib/providers/google";
import { appUrl } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getServerSession())) return NextResponse.redirect(`${appUrl()}/login`);
  const state = randomBytes(16).toString("base64url");
  const url = googleAuthorizeUrl(state);
  if (!url) return NextResponse.redirect(`${appUrl()}/settings?error=google_oauth_not_configured`);
  const res = NextResponse.redirect(url);
  res.cookies.set("aw_google_state", state, { httpOnly: true, secure: appUrl().startsWith("https"), sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
