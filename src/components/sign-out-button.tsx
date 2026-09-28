"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/i18n/client";

export function SignOutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t } = useI18n();
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
      aria-label={iconOnly ? t.nav.signOut : undefined}
      title={iconOnly ? t.nav.signOut : undefined}
      className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card/70 hover:text-foreground disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" strokeWidth={1.75} />
      {iconOnly ? null : pending ? t.nav.signingOut : t.nav.signOut}
    </button>
  );
}
