/**
 * Auth scaffold — Better Auth wired later.
 * Architect tranche: Better Auth (align Base) vs simple session cookie.
 * V1: env gate for operator email only (no public signup).
 */
export function getOperatorEmail(): string {
  return process.env.WATCH_OPERATOR_EMAIL ?? "dany@accura.dev";
}

/** Placeholder until Better Auth session is live. */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.BETTER_AUTH_SECRET);
}
