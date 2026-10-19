import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/require-session";
import { checkAuthorize, issueAuthorizationCode, issuer, readAuthorizeFields } from "@/lib/oauth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameHost(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    return originHost === req.headers.get("host") || originHost === new URL(issuer()).host;
  } catch {
    return false;
  }
}

/** Consent form. Approves or denies the authorization request the user just saw. */
export async function POST(req: Request) {
  if (!sameHost(req)) return new NextResponse("Forbidden", { status: 403 });
  const form = await req.formData();
  const input = readAuthorizeFields((key) => {
    const value = form.get(key);
    return typeof value === "string" ? value : null;
  });
  const check = await checkAuthorize(input);
  if (!check.ok) {
    if (check.redirect) return NextResponse.redirect(check.redirect, 303);
    return new NextResponse(check.message, { status: 400 });
  }
  if (form.get("decision") !== "allow") {
    const denied = new URL(check.input.redirectUri);
    denied.searchParams.set("error", "access_denied");
    denied.searchParams.set("error_description", "The request was denied.");
    denied.searchParams.set("state", check.input.state);
    denied.searchParams.set("iss", issuer());
    return NextResponse.redirect(denied, 303);
  }
  const session = await getServerSession();
  if (!session) {
    const back = `/oauth/authorize?${new URLSearchParams({
      response_type: input.responseType,
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      code_challenge_method: input.codeChallengeMethod,
      resource: input.resource,
      scope: input.scope,
      state: input.state,
    })}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, issuer()), 303);
  }
  return NextResponse.redirect(await issueAuthorizationCode(check), 303);
}
