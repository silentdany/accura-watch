import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "@/lib/prisma";

const OWNER_EMAIL = (
  process.env.OWNER_EMAIL ?? "dany@accura.dev"
).toLowerCase();

function assertOwnerEmail(email: unknown): void {
  if (typeof email !== "string" || email.toLowerCase() !== OWNER_EMAIL) {
    throw new APIError("FORBIDDEN", {
      message: "Only the owner account can sign in to Accura Watch.",
    });
  }
}

const trustedOrigins = [
  "https://watch.accura.dev",
  "https://accura-watch.vercel.app",
  "http://localhost:3000",
];
if (process.env.VERCEL_URL) {
  trustedOrigins.push(`https://${process.env.VERCEL_URL}`);
}

/**
 * Better Auth — email/password, Prisma/Neon, solo OWNER_EMAIL.
 * LOGIN FIX: baseURL + secret + trustedOrigins explicit (CdP).
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          assertOwnerEmail(user.email);
          const existing = await prisma.user.count();
          if (existing > 0) {
            throw new APIError("FORBIDDEN", {
              message: "Owner account already exists. Sign in instead.",
            });
          }
          return { data: user };
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email" || ctx.path === "/sign-up/email") {
        const body = ctx.body as { email?: string } | undefined;
        assertOwnerEmail(body?.email);
      }
      if (ctx.path === "/sign-up/email") {
        const existing = await prisma.user.count();
        if (existing > 0) {
          throw new APIError("FORBIDDEN", {
            message: "Owner account already exists. Sign in instead.",
          });
        }
      }
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
