import { prisma } from "@/lib/prisma";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const signupAllowed = (await prisma.user.count()) === 0;
  return <LoginForm signupAllowed={signupAllowed} />;
}
