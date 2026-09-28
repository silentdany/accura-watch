"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/i18n/client";

function authErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const o = err as { message?: string; statusText?: string; status?: number };
    if (o.message) return o.message;
    if (o.statusText) return `${o.statusText}${o.status ? ` (${o.status})` : ""}`;
  }
  return fallback;
}

export function LoginForm({ signupAllowed }: { signupAllowed: boolean }) {
  const { t } = useI18n();
  const l = t.login;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">(signupAllowed ? "signup" : "signin");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "signin") {
        const { error: err } = await authClient.signIn.email({ email, password, callbackURL: "/" });
        if (err) {
          setError(authErrorMessage(err, l.failedIn));
          setPending(false);
          return;
        }
      } else {
        if (!signupAllowed) {
          setError(l.ownerExists);
          setPending(false);
          return;
        }
        const { error: err } = await authClient.signUp.email({ email, password, name: email.split("@")[0], callbackURL: "/" });
        if (err) {
          setError(authErrorMessage(err, l.failedUp));
          setPending(false);
          return;
        }
      }
      // Hard nav so Set-Cookie is on the next document request (soft
      // router.replace raced middleware and bounced back to /login).
      window.location.assign("/");
      return;
    } catch (err) {
      setError(authErrorMessage(err, l.failed));
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{l.title}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">{l.subtitle}</p>
        </div>
        <div className="card p-6">
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <label className="block">
              <span className="label">{l.email}</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
              />
            </label>
            <label className="block">
              <span className="label">{l.password}</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </label>
            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={pending} className="btn btn-primary mt-1 w-full py-2.5">
              {pending ? l.wait : mode === "signin" ? l.signIn : l.signUp}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {signupAllowed ? (
            <button type="button" className="link font-medium" onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}>
              {mode === "signin" ? l.toSignUp : l.toSignIn}
            </button>
          ) : (
            l.closed
          )}
        </p>
      </div>
    </div>
  );
}
