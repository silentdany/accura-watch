"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    setPending(true);
    try {
      await authClient.signOut();
      window.location.assign("/login");
    } catch {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onSignOut}
      className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
