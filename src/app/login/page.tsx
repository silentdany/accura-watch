import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-border bg-card p-6 shadow-[0_24px_48px_hsl(0_0%_0%/0.35)]">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight">Accura Watch</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Login placeholder — Better Auth (email + password) will plug in here.
          Auth stub lives in{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            src/lib/auth.ts
          </code>
          .
        </p>
        <form className="mt-6 space-y-3" aria-disabled>
          <label className="block text-xs text-muted-foreground">
            Email
            <input
              type="email"
              disabled
              placeholder="you@accura.dev"
              className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Password
            <input
              type="password"
              disabled
              placeholder="••••••••"
              className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none disabled:opacity-60"
            />
          </label>
          <button
            type="button"
            disabled
            className="mt-2 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-70"
          >
            Sign in (coming soon)
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link href="/" className="text-primary hover:underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
