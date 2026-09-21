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

/**
 * Better Auth — email/password, Prisma/Neon adapter, solo OWNER_EMAIL gate.
 * Sign-up blocked once any user exists (H1).
 */
export const auth = betterAuth({
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
