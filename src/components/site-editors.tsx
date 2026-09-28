"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight, Minus, Plus, Trash2 } from "lucide-react";
import { addSiteAction, deleteSiteAction, importGscAction, updateSiteAction } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { ActionForm, Feedback, SubmitButton } from "./forms";
import { Favicon } from "./favicon";

export type Option = { value: string; label: string };

export type EditableSite = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  url: string;
  gscProperty: string | null;
  posthogProjectId: string | null;
  posthogHost: string | null;
  sentryProject: string | null;
  active: boolean;
  pinned: boolean;
  sync: { source: string; ok: boolean; error: string | null; lastRunAt: string }[];
};

export type CatalogOptions = {
  gsc: Option[] | null;
  posthog: Option[] | null;
  sentry: Option[] | null;
};

function MappingSelect({ name, label, value, options, placeholder }: { name: string; label: string; value: string | null; options: Option[] | null; placeholder: string }) {
  const { t } = useI18n();
  // No catalog (provider not connected / API error) → free text input.
  if (!options) {
    return (
      <label className="block">
        <span className="label">{label}</span>
        <input name={name} defaultValue={value ?? ""} placeholder={placeholder} className="input" />
      </label>
    );
  }
  const opts = value && !options.some((o) => o.value === value) ? [{ value, label: t.sites.notFound(value) }, ...options] : options;
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="input">
        <option value="">— {t.common.none} —</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${on ? "bg-good-soft text-good" : "bg-muted text-subtle"}`}>
      {on ? <Check className="h-3 w-3" aria-hidden /> : <Minus className="h-3 w-3" aria-hidden />}
      {label}
    </span>
  );
}

export function SiteEditor({ site, catalogs }: { site: EditableSite; catalogs: CatalogOptions }) {
  const { t } = useI18n();
  const s = t.sites;
  const errors = site.sync.filter((x) => !x.ok);
  const sourceName = (k: string) => (t.sources as Record<string, string>)[k] ?? k;
  return (
    <details id={site.slug} className="card group scroll-mt-24 target:ring-2 target:ring-ring" open={errors.length > 0 || undefined}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-4">
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        <Favicon domain={site.domain} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{site.name}</span>
          <span className="block truncate text-sm text-muted-foreground">{site.domain}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {!site.active ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">{t.status.paused}</span> : null}
          <Chip on={!!site.gscProperty} label="Google" />
          <Chip on={!!site.posthogProjectId} label="PostHog" />
          <Chip on={!!site.sentryProject} label="Sentry" />
          {errors.length ? <span className="rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive">{s.syncProblems}</span> : null}
        </span>
      </summary>

      <div className="border-t border-border px-5 pb-5 pt-4">
        {errors.length ? (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm">
            <p className="mb-1 font-semibold text-destructive">{s.syncProblems}</p>
            {errors.map((e) => (
              <p key={e.source} className="text-foreground [overflow-wrap:anywhere]">
                <span className="font-medium">{sourceName(e.source)}</span> · {e.error}
              </p>
            ))}
          </div>
        ) : null}
        <ActionForm action={updateSiteAction} className="flex flex-col gap-4">
          {(pending, state) => (
            <>
              <input type="hidden" name="id" value={site.id} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label">{s.name}</span>
                  <input name="name" defaultValue={site.name} className="input" required />
                </label>
                <label className="block">
                  <span className="label">{s.uptimeUrl}</span>
                  <input name="url" type="url" defaultValue={site.url} className="input" />
                </label>
              </div>
              <p className="-mb-1 text-sm font-semibold">{s.connections}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MappingSelect name="gscProperty" label={s.gscProperty} value={site.gscProperty} options={catalogs.gsc} placeholder="sc-domain:example.com" />
                <MappingSelect name="sentryProject" label={s.sentryProject} value={site.sentryProject} options={catalogs.sentry} placeholder="project-slug" />
                <MappingSelect name="posthogProjectId" label={s.posthogProject} value={site.posthogProjectId} options={catalogs.posthog} placeholder="12345" />
                <label className="block">
                  <span className="label">{s.posthogHost}</span>
                  <input name="posthogHost" defaultValue={site.posthogHost ?? ""} placeholder={site.domain} className="input" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="active" defaultChecked={site.active} className="h-4 w-4 accent-[hsl(var(--primary))]" /> {s.active}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="pinned" defaultChecked={site.pinned} className="h-4 w-4 accent-[hsl(var(--primary))]" /> {s.pinned}
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Link href={`/sites/${site.slug}`} className="link text-sm font-medium">
                  {t.common.seeSite}
                </Link>
                <div className="flex flex-wrap items-center gap-3">
                  <Feedback state={state} />
                  <button
                    type="submit"
                    formAction={deleteSiteAction}
                    formNoValidate
                    className="btn btn-danger"
                    onClick={(e) => {
                      if (!confirm(s.confirmDelete(site.domain))) e.preventDefault();
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> {t.common.delete}
                  </button>
                  <SubmitButton pending={pending}>{t.common.save}</SubmitButton>
                </div>
              </div>
            </>
          )}
        </ActionForm>
      </div>
    </details>
  );
}

export function AddSiteForm() {
  const { t } = useI18n();
  const s = t.sites;
  return (
    <ActionForm action={addSiteAction} resetOnSuccess className="flex flex-col gap-4 px-5 pb-5">
      {(pending, state) => (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">{s.domain}</span>
              <input name="domain" required placeholder="example.com" className="input" />
            </label>
            <label className="block">
              <span className="label">
                {s.name} <span className="font-normal text-muted-foreground">({t.common.optional})</span>
              </span>
              <input name="name" placeholder="Example" className="input" />
            </label>
          </div>
          <p className="text-[13px] text-muted-foreground">{s.autoMatchNote}</p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Feedback state={state} />
            <SubmitButton pending={pending}>
              <Plus className="h-4 w-4" /> {s.addButton}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function GscImportForm({ candidates }: { candidates: { property: string; domain: string }[] }) {
  const { t } = useI18n();
  const s = t.sites;
  const [selected, setSelected] = useState<Set<string>>(new Set(candidates.map((c) => c.property)));
  const all = selected.size === candidates.length;
  return (
    <ActionForm action={importGscAction} className="flex flex-col">
      {(pending, state) => (
        <>
          <div className="flex items-center justify-between border-y border-border px-5 py-2.5 text-sm text-muted-foreground">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={all}
                onChange={() => setSelected(all ? new Set() : new Set(candidates.map((c) => c.property)))}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              {s.selectAll(candidates.length)}
            </label>
            <span>{s.selected(selected.size)}</span>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {candidates.map((c) => (
              <li key={c.property}>
                <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-card-hover">
                  <input
                    type="checkbox"
                    name="property"
                    value={c.property}
                    checked={selected.has(c.property)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(c.property);
                      else next.delete(c.property);
                      setSelected(next);
                    }}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <Favicon domain={c.domain} size={18} />
                  <span className="font-medium">{c.domain}</span>
                  <span className="ml-auto hidden truncate text-[13px] text-subtle sm:inline">{c.property}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
            <Feedback state={state} />
            <SubmitButton pending={pending}>{s.importN(selected.size)}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
