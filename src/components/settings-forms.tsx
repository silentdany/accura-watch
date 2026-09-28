"use client";

import { createTokenAction, disconnectIntegrationAction, saveIntegrationAction } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { ActionForm, CopyField, Feedback, SubmitButton } from "./forms";

function Field({ label, children, hint, wide }: { label: string; children: React.ReactNode; hint?: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[13px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export type ProviderId = "google" | "posthog" | "sentry" | "dataforseo" | "openpagerank" | "ahrefs";

export function IntegrationForm({ provider, name, connected, config }: { provider: ProviderId; name: string; connected: boolean; config: Record<string, unknown> }) {
  const { t } = useI18n();
  const s = t.settings;
  const fl = s.fields;
  const c = (k: string, d = "") => (config[k] == null ? d : String(config[k]));
  const keep = connected ? s.keep : "";
  return (
    <ActionForm action={saveIntegrationAction} className="flex flex-1 flex-col gap-4">
      {(pending, state) => (
        <>
          <input type="hidden" name="provider" value={provider} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {provider === "google" ? (
              <Field label={fl.serviceAccount} wide>
                <textarea name="serviceAccount" rows={3} placeholder='{"type": "service_account", "client_email": "…", "private_key": "…"}' className="input font-mono text-[13px]" />
              </Field>
            ) : null}
            {provider === "posthog" ? (
              <>
                <Field label={fl.personalApiKey}>
                  <input name="apiKey" type="password" placeholder={keep || "phx_…"} required={!connected} className="input" autoComplete="off" />
                </Field>
                <Field label={fl.host}>
                  <select name="host" defaultValue={c("host", "https://us.posthog.com")} className="input">
                    <option value="https://us.posthog.com">US Cloud (us.posthog.com)</option>
                    <option value="https://eu.posthog.com">EU Cloud (eu.posthog.com)</option>
                  </select>
                </Field>
              </>
            ) : null}
            {provider === "sentry" ? (
              <>
                <Field label={fl.authToken} wide>
                  <input name="token" type="password" placeholder={keep || "sntryu_…"} required={!connected} className="input" autoComplete="off" />
                </Field>
                <Field label={fl.org} hint={fl.orgHint}>
                  <input name="org" defaultValue={c("org")} placeholder="my-org" className="input" />
                </Field>
                <Field label={fl.sentryHost} hint={fl.sentryHostHint}>
                  <input name="host" defaultValue={c("host", "https://sentry.io")} className="input" />
                </Field>
              </>
            ) : null}
            {provider === "dataforseo" ? (
              <>
                <Field label={fl.login}>
                  <input name="login" type="text" placeholder={keep || "you@example.com"} required={!connected} className="input" autoComplete="off" />
                </Field>
                <Field label={fl.password}>
                  <input name="password" type="password" placeholder={keep} required={!connected} className="input" autoComplete="off" />
                </Field>
                <Field label={fl.location} hint={fl.locationHint}>
                  <input name="locationCode" type="number" defaultValue={c("locationCode", "2250")} className="input" />
                </Field>
                <Field label={fl.language} hint={fl.languageHint}>
                  <input name="languageCode" defaultValue={c("languageCode", "fr")} className="input" />
                </Field>
                <Field label={fl.cadence} hint={fl.cadenceHint}>
                  <input name="cadenceDays" type="number" min={1} defaultValue={c("cadenceDays", "7")} className="input" />
                </Field>
                <label className="flex items-center gap-2.5 self-center text-sm">
                  <input
                    type="checkbox"
                    name="backlinks"
                    defaultChecked={config.backlinks === undefined ? true : Boolean(config.backlinks)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  {fl.backlinks}
                </label>
              </>
            ) : null}
            {provider === "ahrefs" || provider === "openpagerank" ? (
              <Field label={fl.apiKey} wide>
                <input name="apiKey" type="password" placeholder={keep} required={!connected} className="input" autoComplete="off" />
              </Field>
            ) : null}
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-end gap-3 pt-2">
            <Feedback state={state} />
            {connected ? (
              <button
                type="submit"
                formAction={disconnectIntegrationAction}
                formNoValidate
                className="btn btn-danger"
                onClick={(e) => {
                  if (!confirm(s.confirmDisconnect(name))) e.preventDefault();
                }}
              >
                {t.common.disconnect}
              </button>
            ) : null}
            <SubmitButton pending={pending}>{connected ? t.common.update : t.common.connect}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function CreateTokenForm({ mcpUrl }: { mcpUrl: string }) {
  const { t } = useI18n();
  const s = t.settings;
  return (
    <ActionForm action={createTokenAction} className="flex flex-col gap-3">
      {(pending, state) => (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-48 flex-1">
              <span className="label">{s.tokenName}</span>
              <input name="name" placeholder={s.tokenPlaceholder} className="input" />
            </label>
            <SubmitButton pending={pending}>{s.createToken}</SubmitButton>
          </div>
          {state?.token ? (
            <div className="flex flex-col gap-2 rounded-xl border border-good/30 bg-good-soft p-4">
              <p className="text-sm font-medium text-good">{state.message}</p>
              <CopyField value={state.token} />
              <p className="mt-1 text-[13px] text-muted-foreground">{s.claudeCode}</p>
              <CopyField value={`claude mcp add --transport http accura-watch ${mcpUrl} --header "Authorization: Bearer ${state.token}"`} />
              <p className="mt-1 text-[13px] text-muted-foreground">{s.urlKey}</p>
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
