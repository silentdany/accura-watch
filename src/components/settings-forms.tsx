"use client";

import { createTokenAction, disconnectIntegrationAction, saveIntegrationAction } from "@/app/actions";
import { ActionForm, CopyField, Feedback, SubmitButton } from "./forms";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-subtle">{hint}</span> : null}
    </label>
  );
}

function Footer({ pending, state, connected, provider }: { pending: boolean; state: Parameters<typeof Feedback>[0]["state"]; connected: boolean; provider: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
      <Feedback state={state} />
      {connected ? (
        <button
          type="submit"
          formAction={disconnectIntegrationAction}
          formNoValidate
          className="btn btn-danger"
          onClick={(e) => {
            if (!confirm(`Disconnect ${provider}? Stored credentials will be deleted.`)) e.preventDefault();
          }}
        >
          Disconnect
        </button>
      ) : null}
      <SubmitButton pending={pending}>{connected ? "Update" : "Connect"}</SubmitButton>
    </div>
  );
}

const keep = (connected: boolean) => (connected ? "•••••••• (leave blank to keep)" : "");

export function IntegrationForm({
  provider,
  connected,
  config,
}: {
  provider: "google" | "posthog" | "sentry" | "dataforseo" | "openpagerank" | "ahrefs";
  connected: boolean;
  config: Record<string, unknown>;
}) {
  const c = (k: string, d = "") => (config[k] == null ? d : String(config[k]));
  return (
    <ActionForm action={saveIntegrationAction} className="grid gap-3 sm:grid-cols-2">
      {(pending, state) => (
        <>
          <input type="hidden" name="provider" value={provider} />
          {provider === "google" ? (
            <div className="sm:col-span-2">
              <Field
                label="Service account JSON key"
                hint="Alternative to OAuth: create a service account in Google Cloud, enable the Search Console API, then add the service account email as a (restricted) user on each property."
              >
                <textarea name="serviceAccount" rows={3} placeholder='{"type": "service_account", "client_email": "...", "private_key": "..."}' className="input font-mono text-xs" />
              </Field>
            </div>
          ) : null}
          {provider === "posthog" ? (
            <>
              <Field label="Personal API key" hint="PostHog → Settings → Personal API keys. Scopes: project:read, query:read.">
                <input name="apiKey" type="password" placeholder={keep(connected) || "phx_..."} required={!connected} className="input" autoComplete="off" />
              </Field>
              <Field label="Host">
                <select name="host" defaultValue={c("host", "https://us.posthog.com")} className="input">
                  <option value="https://us.posthog.com">US Cloud (us.posthog.com)</option>
                  <option value="https://eu.posthog.com">EU Cloud (eu.posthog.com)</option>
                </select>
              </Field>
            </>
          ) : null}
          {provider === "sentry" ? (
            <>
              <Field label="Auth token" hint="Sentry → Settings → Auth Tokens (org:read, project:read, event:read).">
                <input name="token" type="password" placeholder={keep(connected) || "sntrys_..."} required={!connected} className="input" autoComplete="off" />
              </Field>
              <Field label="Organization slug" hint="Leave empty to use the token's first organization.">
                <input name="org" defaultValue={c("org")} placeholder="my-org" className="input" />
              </Field>
              <Field label="Host" hint="https://de.sentry.io for EU data residency, or your self-hosted URL.">
                <input name="host" defaultValue={c("host", "https://sentry.io")} className="input" />
              </Field>
            </>
          ) : null}
          {provider === "dataforseo" ? (
            <>
              <Field label="API login" hint="app.dataforseo.com → API Access. Pay-as-you-go, no subscription.">
                <input name="login" type="text" placeholder={keep(connected) || "you@example.com"} required={!connected} className="input" autoComplete="off" />
              </Field>
              <Field label="API password">
                <input name="password" type="password" placeholder={keep(connected)} required={!connected} className="input" autoComplete="off" />
              </Field>
              <Field label="Location code" hint="2840 = US, 2250 = France, 2826 = UK, 2276 = Germany">
                <input name="locationCode" type="number" defaultValue={c("locationCode", "2840")} className="input" />
              </Field>
              <Field label="Language code">
                <input name="languageCode" defaultValue={c("languageCode", "en")} className="input" />
              </Field>
              <Field label="Refresh every (days)" hint="Each refresh ≈ $0.02–0.05 per site.">
                <input name="cadenceDays" type="number" min={1} defaultValue={c("cadenceDays", "7")} className="input" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="backlinks" defaultChecked={config.backlinks === undefined ? true : Boolean(config.backlinks)} className="accent-[hsl(var(--primary))]" />
                Include Backlinks API (rank, referring domains)
              </label>
            </>
          ) : null}
          {provider === "ahrefs" ? (
            <div className="sm:col-span-2">
              <Field label="Free API key" hint="Ahrefs free APIv3 key — Domain Rating via /v3/public/domain-rating-free, no API units used.">
                <input name="apiKey" type="password" placeholder={keep(connected)} required={!connected} className="input" autoComplete="off" />
              </Field>
            </div>
          ) : null}
          {provider === "openpagerank" ? (
            <div className="sm:col-span-2">
              <Field label="API key" hint="Free at domcop.com/openpagerank — 0–10 authority score for every domain.">
                <input name="apiKey" type="password" placeholder={keep(connected)} required={!connected} className="input" autoComplete="off" />
              </Field>
            </div>
          ) : null}
          <Footer pending={pending} state={state} connected={connected} provider={provider} />
        </>
      )}
    </ActionForm>
  );
}

export function CreateTokenForm({ mcpUrl }: { mcpUrl: string }) {
  return (
    <ActionForm action={createTokenAction} className="flex flex-col gap-3">
      {(pending, state) => (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-48 flex-1">
              <span className="label">Token name</span>
              <input name="name" placeholder="Claude Code on my laptop" className="input" />
            </label>
            <SubmitButton pending={pending}>Create token</SubmitButton>
          </div>
          {state?.token ? (
            <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-primary">{state.message}</p>
              <CopyField value={state.token} />
              <p className="mt-1 text-[11px] text-muted-foreground">Claude Code:</p>
              <CopyField value={`claude mcp add --transport http accura-watch ${mcpUrl} --header "Authorization: Bearer ${state.token}"`} />
              <p className="mt-1 text-[11px] text-muted-foreground">Clients without custom headers (URL-embedded key — keep it private):</p>
              <CopyField value={`${mcpUrl}?key=${state.token}`} />
            </div>
          ) : (
            <Feedback state={state} />
          )}
        </>
      )}
    </ActionForm>
  );
}
