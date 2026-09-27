"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">(
    signupAllowed ? "signup" : "signin",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "signin") {
        const { error: err } = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/",
        });
        if (err) {
          setError(authErrorMessage(err, "Sign in failed"));
          setPending(false);
          return;
        }
      } else {
        if (!signupAllowed) {
          setError("Owner account already exists. Sign in instead.");
          setPending(false);
          return;
        }
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: email.split("@")[0],
          callbackURL: "/",
        });
        if (err) {
          setError(authErrorMessage(err, "Sign up failed"));
          setPending(false);
          return;
        }
      }
      // Hard nav so Set-Cookie is on the next document request (soft
      // router.replace raced middleware and bounced back to /login).
      window.location.assign("/");
      return;
    } catch (err) {
      setError(authErrorMessage(err, "Auth request failed"));
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-border bg-card p-6 shadow-[0_24px_48px_hsl(0_0%_0%/0.35)]">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight">Accura Watch</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Single-owner instance — email + password.
        </p>
        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <label className="block text-xs text-muted-foreground">
            Email
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="mt-2 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-70"
          >
            {pending
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create owner account"}
          </button>
        </form>
        {signupAllowed ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() =>
                setMode((m) => (m === "signin" ? "signup" : "signin"))
              }
            >
              {mode === "signin"
                ? "First time? Create owner account"
                : "Already registered? Sign in"}
            </button>
          </p>
        ) : (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Sign-up closed — owner account exists.
          </p>
        )}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          <Link href="/" className="text-primary hover:underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
