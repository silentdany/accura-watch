"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
        });
        if (err) {
          setError(err.message ?? "Sign in failed");
          return;
        }
      } else {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: "Danny",
        });
        if (err) {
          setError(err.message ?? "Sign up failed");
          return;
        }
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth request failed");
    } finally {
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
          Solo owner login — email + password (Better Auth).
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
              placeholder="dany@accura.dev"
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
            <p className="text-xs text-destructive" role="alert">
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
        <p className="mt-2 text-center text-xs text-muted-foreground">
          <Link href="/" className="text-primary hover:underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
