import { redirect } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { getI18n } from "@/i18n/server";
import { getServerSession } from "@/lib/require-session";
import { isLoopback } from "@/lib/oauth/checks";
import { checkAuthorize, readAuthorizeFields } from "@/lib/oauth/server";

export const dynamic = "force-dynamic";

function loopbackRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && isLoopback(url.hostname);
  } catch {
    return false;
  }
}

function redirectDestination(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.protocol === "http:" || url.protocol === "https:") return url.host;
    return `${url.protocol}//${url.host}`;
  } catch {
    return uri;
  }
}

function safeNext(params: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") q.set(key, value);
  }
  return `/oauth/authorize?${q.toString()}`;
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const o = t.oauth;
  const input = readAuthorizeFields((key) => (typeof sp[key] === "string" ? sp[key] : null));
  const check = await checkAuthorize(input);
  if (!check.ok) {
    if (check.redirect) redirect(check.redirect);
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="card w-full max-w-md p-6">
          <h1 className="text-xl font-semibold">{o.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{o.invalid}</p>
        </div>
      </main>
    );
  }
  const session = await getServerSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(safeNext(sp))}`);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={56} className="mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight">{o.title}</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">{o.body(check.client.name)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{o.returnsTo(redirectDestination(check.input.redirectUri))}</p>
          {loopbackRedirect(check.input.redirectUri) ? <p className="mt-1 text-sm text-muted-foreground">{o.loopback}</p> : null}
        </div>
        <div className="card p-6">
          <p className="text-sm text-muted-foreground">{o.signedInAs(session.user.email)}</p>
          {check.client.clientUri?.startsWith("https://") ? (
            <p className="mt-2 truncate text-sm">
              <a href={check.client.clientUri} target="_blank" rel="noreferrer" className="link">
                {check.client.clientUri}
              </a>
            </p>
          ) : null}
          <form method="post" action="/oauth/decision" className="mt-5 flex flex-col gap-2">
            <input type="hidden" name="response_type" value={input.responseType} />
            <input type="hidden" name="client_id" value={input.clientId} />
            <input type="hidden" name="redirect_uri" value={input.redirectUri} />
            <input type="hidden" name="code_challenge" value={input.codeChallenge} />
            <input type="hidden" name="code_challenge_method" value={input.codeChallengeMethod} />
            <input type="hidden" name="resource" value={input.resource} />
            <input type="hidden" name="scope" value={input.scope} />
            <input type="hidden" name="state" value={input.state} />
            <button type="submit" name="decision" value="allow" className="btn btn-primary w-full py-2.5">
              {o.allow}
            </button>
            <button type="submit" name="decision" value="deny" className="btn btn-ghost w-full py-2.5">
              {o.deny}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
