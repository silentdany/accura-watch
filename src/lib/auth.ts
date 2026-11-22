import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/env";
import { CACHE_TAGS, DAY_MS, cachedPerWindow, invalidate } from "@/lib/cache";

/**
 * Single-owner instance.
 * - OWNER_EMAIL set → only that email may sign up / sign in.
 * - OWNER_EMAIL unset → the first account created becomes the owner.
 * In both cases sign-up closes once a user exists.
 */
const OWNER_EMAIL = process.env.OWNER_EMAIL?.trim().toLowerCase() || null;

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("BETTER_AUTH_SECRET is required in production");
}

function assertOwnerEmail(email: unknown): void {
  if (!OWNER_EMAIL) return;
  if (typeof email !== "string" || email.toLowerCase() !== OWNER_EMAIL) {
    throw new APIError("FORBIDDEN", {
      message: "Only the owner account can sign in to this instance.",
    });
  }
}

async function assertSignupOpen(): Promise<void> {
  if ((await prisma.user.count()) > 0) {
    throw new APIError("FORBIDDEN", {
      message: "Owner account already exists. Sign in instead.",
    });
  }
}

/**
 * True once the owner account exists, cached for the current UTC day so the
 * login page does not wake the database. "No owner yet" is never cached, and
 * creating the account drops the cache. Sign-up itself still counts users in
 * the database (assertSignupOpen), so this cache never decides who may sign up.
 */
export const ownerExists = cachedPerWindow(
  "owner-exists-v1",
  async (): Promise<true | null> => ((await prisma.user.count()) > 0 ? true : null),
  { windowMs: DAY_MS, tags: [CACHE_TAGS.owner] },
);

const baseURL = appUrl();

export const auth = betterAuth({
  baseURL,
  secret: secret ?? "dev-only-insecure-secret-change-me",
  trustedOrigins: [
    baseURL,
    "http://localhost:3000",
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  // Signed session data in a cookie for 5 minutes: page views and API calls with a
  // browser session skip the session table in between. Signing out clears the
  // cookies in that browser only: a copy taken earlier, or a session deleted in
  // the database, stays usable for at most 5 minutes.
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          assertOwnerEmail(user.email);
          await assertSignupOpen();
          return { data: user };
        },
        after: async () => {
          invalidate(CACHE_TAGS.owner);
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email" || ctx.path === "/sign-up/email") {
        assertOwnerEmail((ctx.body as { email?: string } | undefined)?.email);
      }
      if (ctx.path === "/sign-up/email") await assertSignupOpen();
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
