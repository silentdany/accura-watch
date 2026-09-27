"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { autoMatchAction, syncNowAction, type ActionState } from "@/app/actions";

export function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-xs ${state.ok ? "text-primary" : "text-destructive"}`}>
      {state.message}
    </p>
  );
}

/** Form bound to a server action with inline success/error feedback. */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  children: (pending: boolean, state: ActionState) => React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children(pending, state)}
    </form>
  );
}

export function SubmitButton({ pending, children, variant = "primary" }: { pending: boolean; children: React.ReactNode; variant?: "primary" | "ghost" }) {
  return (
    <button type="submit" disabled={pending} className={`btn btn-${variant}`}>
      {pending ? <Loader2 className="spin h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

function useFlash() {
  const [state, setState] = useState<ActionState>(null);
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(null), state.ok ? 5000 : 15000);
    return () => clearTimeout(t);
  }, [state]);
  return [state, setState] as const;
}

export function SyncButton({ siteId, label = "Sync now" }: { siteId?: string; label?: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useFlash();
  return (
    <div className="flex items-center gap-3">
      {state ? (
        <span className={`max-w-md truncate text-xs ${state.ok ? "text-primary" : "text-destructive"}`} title={state.message}>
          {state.message}
        </span>
      ) : null}
      <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => start(async () => setState(await syncNowAction(siteId)))}>
        <RefreshCw className={`h-3.5 w-3.5 ${pending ? "spin" : ""}`} />
        {pending ? "Syncing…" : label}
      </button>
    </div>
  );
}

export function AutoMatchButton() {
  const [pending, start] = useTransition();
  const [state, setState] = useFlash();
  return (
    <div className="flex items-center gap-3">
      {state ? <span className={`text-xs ${state.ok ? "text-primary" : "text-destructive"}`}>{state.message}</span> : null}
      <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => start(async () => setState(await autoMatchAction()))}>
        <Wand2 className="h-3.5 w-3.5" />
        {pending ? "Matching…" : "Auto-match projects"}
      </button>
    </div>
  );
}

export function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className={`min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border-strong bg-muted px-2.5 py-2 text-xs ${mono ? "font-mono" : ""}`}>
        {value}
      </code>
      <button
        type="button"
        className="btn btn-ghost px-2.5"
        aria-label="Copy"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
