/**
 * Better Auth stub — wire email/password + Neon adapter in a follow-up.
 * Keep exports stable so login / middleware can import early.
 */
export const authConfig = {
  provider: "better-auth" as const,
  basePath: "/api/auth",
};

export async function getSessionStub(): Promise<null> {
  return null;
}
