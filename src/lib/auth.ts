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
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
