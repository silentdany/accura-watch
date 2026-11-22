import { ownerExists } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

/** Only send the user back into the OAuth consent screen. Anything else goes home. */
function safeAuthorizeNext(raw: string | undefined): string {
  if (!raw) return "/";
  try {
    const url = new URL(raw, "http://local");
    if (url.origin !== "http://local" || url.pathname !== "/oauth/authorize") return "/";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nextPath = safeAuthorizeNext((await searchParams).next);
  const signupAllowed = !(await ownerExists());
  return <LoginForm signupAllowed={signupAllowed} nextPath={nextPath} />;
}
