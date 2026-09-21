import { prisma } from "@/lib/prisma";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const userCount = await prisma.user.count();
  const signupAllowed = userCount === 0;

  return <LoginForm signupAllowed={signupAllowed} />;
}
