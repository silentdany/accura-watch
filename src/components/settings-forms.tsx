"use client";

import { useState } from "react";
import { createTokenAction, disconnectIntegrationAction, refreshOpenSeoUsageAction, saveIntegrationAction } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import type { OpenSeoUsage } from "@/lib/providers/openseo";
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

export type ProviderId = "google" | "posthog" | "sentry" | "openseo" | "dataforseo" | "openpagerank" | "ahrefs";

export function IntegrationForm({
  provider,
  name,
  connected,
  config,
  usage,
}: {
  provider: ProviderId;
  name: string;
  connected: boolean;
  config: Record<string, unknown>;
  usage?: OpenSeoUsage | null;
}) {
  const { t, f, locale } = useI18n();
  const s = t.settings;
  const fl = s.fields;
  const c = (k: string, d = "") => (config[k] == null ? d : String(config[k]));
  const keep = connected ? s.keep : "";
  const amount = (n: number) => f.dec(n, 2);
  const priced = (n: number) => (locale === "en" ? `$${amount(n)}` : `${amount(n)} $`);
  const [checking, setChecking] = useState(false);
  const [balanceNote, setBalanceNote] = useState<string | null>(null);
  return (
    <ActionForm action={saveIntegrationAction} className="flex flex-1 flex-col gap-4">
      {(pending, state) => (
        <>
          <input type="hidden" name="provider" value={provider} />
          {provider === "openseo" && usage?.connected ? (
            <div className="rounded-xl border border-border p-4">
              <p className="font-medium">{s.openseo.thisMonth}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {s.openseo.spent(amount(usage.monthUsd))}
                {" · "}
                {usage.monthlyCapUsd != null
                  ? s.openseo.capLeft(amount(usage.monthlyCapUsd), amount(Math.max(0, usage.monthlyCapUsd - usage.monthUsd)))
                  : s.openseo.noCap}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {usage.remainingUsd != null && usage.balanceCheckedAt
                  ? s.openseo.balance(amount(usage.remainingUsd), f.ago(usage.balanceCheckedAt))
                  : s.openseo.balanceUnknown}
              </p>
              <button
                type="button"
                className="btn mt-3"
                disabled={checking}
                onClick={() => {
                  setChecking(true);
                  void refreshOpenSeoUsageAction().then((res) => {
                    setBalanceNote(res?.message ?? null);
                    setChecking(false);
                  });
                }}
              >
                {checking ? t.sync.running : s.openseo.checkBalance}
              </button>
              {balanceNote ? <p className="mt-2 text-sm text-muted-foreground">{balanceNote}</p> : null}
              {usage.calls.length ? (
                <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-[13px]">
                  {usage.calls.map((call) => (
                    <li key={call.id} className="flex items-baseline justify-between gap-3">
                      <span>
                        {call.domain} · {s.openseo.toolLabel(call.tool)}
                      </span>
                      <span className="tabular shrink-0 text-muted-foreground">
                        {call.detail === "reserved"
                          ? s.openseo.reserved
                          : call.detail === "cost unknown"
                            ? s.openseo.costUnknown
                            : `${priced(call.usd)} · ${f.dateTime(call.at)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] text-muted-foreground">{s.openseo.noCalls}</p>
              )}
            </div>
          ) : null}
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
            {provider === "openseo" ? (
              <>
                <Field label={fl.apiKey} hint={fl.openseoKeyHint} wide>
                  <input name="apiKey" type="password" placeholder={keep || "oseo_…"} required={!connected} className="input" autoComplete="off" />
                </Field>
                <Field label={fl.monthlyCap} hint={fl.monthlyCapHint} wide>
                  <input name="monthlyCapUsd" type="text" inputMode="decimal" defaultValue={c("monthlyCapUsd")} placeholder="8" className="input" />
                </Field>
                <Field label={fl.location} hint={fl.locationHint}>
                  <input name="locationCode" type="number" defaultValue={c("locationCode", "2250")} className="input" />
                </Field>
                <Field label={fl.language} hint={fl.languageHint}>
                  <input name="languageCode" defaultValue={c("languageCode", "fr")} className="input" />
                </Field>
                <Field label={fl.cadence} hint={fl.openseoCadenceHint}>
                  <input name="cadenceDays" type="number" min={1} defaultValue={c("cadenceDays", "30")} className="input" />
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
