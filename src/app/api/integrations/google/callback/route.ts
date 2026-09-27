import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/require-session";
import { exchangeGoogleCode } from "@/lib/providers/google";
import { saveIntegration } from "@/lib/integrations";
import { appUrl } from "@/lib/env";
import { errorMessage } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(`${appUrl()}/settings?${q}`);
    res.cookies.delete("aw_google_state");
    return res;
  };
  if (!(await getServerSession())) return NextResponse.redirect(`${appUrl()}/login`);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  if (err) return back(`error=${encodeURIComponent(err)}`);
  if (!code || !state || state !== req.cookies.get("aw_google_state")?.value) return back("error=invalid_oauth_state");
  try {
    const { refreshToken, email } = await exchangeGoogleCode(code);
    await saveIntegration("google", { email }, { refreshToken, clientEmail: null, privateKey: null });
    return back("connected=google");
  } catch (e) {
    return back(`error=${encodeURIComponent(errorMessage(e))}`);
  }
}
