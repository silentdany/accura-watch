/** Public origin of this instance, without trailing slash. */
export function appUrl(): string {
  const raw =
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

export function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}
