import { betterAuth, getCurrentAdapter } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/env";

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

const SIGNUP_CLOSED = "Owner account already exists. Sign in instead.";

async function assertSignupOpen(): Promise<void> {
  if ((await prisma.user.count()) > 0) {
    throw new APIError("FORBIDDEN", { message: SIGNUP_CLOSED });
  }
}

type AuthAdapter = Awaited<ReturnType<typeof getCurrentAdapter>>;

/** Fixed id of the row that serializes owner sign-ups. It never outlives its transaction. */
export const SIGNUP_LOCK_ID = "owner-signup-lock";

/**
 * Runs inside the sign-up transaction (prismaAdapter `transaction: true`), on its
 * connection. Inserting a row with a fixed primary key makes a concurrent sign-up
 * wait on the unique index until this transaction ends; the row is deleted again
 * before commit, so nothing is left behind. The count that follows therefore sees
 * any owner committed by the sign-up that held the lock, and only one can win.
 */
async function lockSignupAndAssertOpen(adapter: AuthAdapter): Promise<void> {
  const now = new Date();
  await adapter.create({
    model: "verification",
    data: { id: SIGNUP_LOCK_ID, identifier: SIGNUP_LOCK_ID, value: "1", expiresAt: now, createdAt: now, updatedAt: now },
    forceAllowId: true,
  });
  await adapter.delete({ model: "verification", where: [{ field: "id", value: SIGNUP_LOCK_ID }] });
  if ((await adapter.count({ model: "user" })) > 0) {
    throw new APIError("FORBIDDEN", { message: SIGNUP_CLOSED });
  }
}

const baseURL = appUrl();

export const auth = betterAuth({
  baseURL,
  secret: secret ?? "dev-only-insecure-secret-change-me",
  trustedOrigins: [
    baseURL,
    "http://localhost:3000",
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
  // Sign-up runs in one transaction, so the owner lock below and the user insert commit together.
  database: prismaAdapter(prisma, { provider: "postgresql", transaction: true }),
  emailAndPassword: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          assertOwnerEmail(user.email);
          const adapter = await getCurrentAdapter(ctx?.context.adapter as AuthAdapter);
          if (adapter) await lockSignupAndAssertOpen(adapter);
          else await assertSignupOpen();
          return { data: user };
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
