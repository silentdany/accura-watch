"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { addSiteAction, deleteSiteAction, importGscAction, updateSiteAction } from "@/app/actions";
import { ActionForm, Feedback, SubmitButton } from "./forms";
import { Favicon } from "./ui";

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

function MappingSelect({
  name,
  label,
  value,
  options,
  placeholder,
}: {
  name: string;
  label: string;
  value: string | null;
  options: Option[] | null;
  placeholder: string;
}) {
  // No catalog (provider not connected / API error) → free text input.
  if (!options) {
    return (
      <label className="block">
        <span className="label">{label}</span>
        <input name={name} defaultValue={value ?? ""} placeholder={placeholder} className="input" />
      </label>
    );
  }
  const opts = value && !options.some((o) => o.value === value) ? [{ value, label: `${value} (not found)` }, ...options] : options;
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="input">
        <option value="">— none —</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SiteEditor({ site, catalogs }: { site: EditableSite; catalogs: CatalogOptions }) {
  const errors = site.sync.filter((s) => !s.ok);
  return (
    <div id={site.slug} className="scroll-mt-20 rounded-[var(--radius-md)] border border-border bg-card target:border-primary/60">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <Link href={`/sites/${site.slug}`} className="flex min-w-0 items-center gap-2.5 hover:text-primary">
          <Favicon domain={site.domain} size={18} />
          <span className="truncate font-medium">{site.name}</span>
          <span className="truncate text-xs text-muted-foreground">{site.domain}</span>
        </Link>
        <div className="flex items-center gap-2">
          {!site.active ? <span className="text-[11px] text-warning">paused</span> : null}
          <form
            action={deleteSiteAction}
            onSubmit={(e) => {
              if (!confirm(`Delete ${site.domain} and all its history?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={site.id} />
            <button type="submit" className="btn btn-danger px-2" aria-label={`Delete ${site.domain}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
      <ActionForm action={updateSiteAction} className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {(pending, state) => (
          <>
            <input type="hidden" name="id" value={site.id} />
            <label className="block">
              <span className="label">Name</span>
              <input name="name" defaultValue={site.name} className="input" required />
            </label>
            <label className="block">
              <span className="label">Uptime URL</span>
              <input name="url" type="url" defaultValue={site.url} className="input" />
            </label>
            <MappingSelect name="gscProperty" label="Search Console property" value={site.gscProperty} options={catalogs.gsc} placeholder="sc-domain:example.com" />
            <MappingSelect name="sentryProject" label="Sentry project" value={site.sentryProject} options={catalogs.sentry} placeholder="project-slug" />
            <MappingSelect name="posthogProjectId" label="PostHog project" value={site.posthogProjectId} options={catalogs.posthog} placeholder="12345" />
            <label className="block">
              <span className="label">PostHog $host filter (shared projects)</span>
              <input name="posthogHost" defaultValue={site.posthogHost ?? ""} placeholder={site.domain} className="input" />
            </label>
            <div className="flex items-end gap-4 pb-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="active" defaultChecked={site.active} className="accent-[hsl(var(--primary))]" /> Active
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="pinned" defaultChecked={site.pinned} className="accent-[hsl(var(--primary))]" /> Pinned
              </label>
            </div>
            <div className="flex items-end justify-end gap-3">
              <Feedback state={state} />
              <SubmitButton pending={pending} variant="ghost">
                Save
              </SubmitButton>
            </div>
            {errors.length ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive sm:col-span-2 xl:col-span-4">
                {errors.map((e) => (
                  <p key={e.source}>
                    <span className="font-medium uppercase">{e.source}</span> — {e.error}
                  </p>
                ))}
              </div>
            ) : null}
          </>
        )}
      </ActionForm>
    </div>
  );
}

export function AddSiteForm() {
  return (
    <ActionForm action={addSiteAction} resetOnSuccess className="flex flex-col gap-3 p-4">
      {(pending, state) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Domain or URL</span>
              <input name="domain" required placeholder="example.com" className="input" />
            </label>
            <label className="block">
              <span className="label">Name (optional)</span>
              <input name="name" placeholder="Example" className="input" />
            </label>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Search Console, PostHog and Sentry projects are auto-matched.</p>
            <SubmitButton pending={pending}>
              <Plus className="h-3.5 w-3.5" /> Add site
            </SubmitButton>
          </div>
          <Feedback state={state} />
        </>
      )}
    </ActionForm>
  );
}

export function GscImportForm({ candidates }: { candidates: { property: string; domain: string }[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(candidates.map((c) => c.property)));
  const all = selected.size === candidates.length;
  return (
    <ActionForm action={importGscAction} className="flex flex-col">
      {(pending, state) => (
        <>
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={all}
                onChange={() => setSelected(all ? new Set() : new Set(candidates.map((c) => c.property)))}
                className="accent-[hsl(var(--primary))]"
              />
              Select all ({candidates.length})
            </label>
            <span>{selected.size} selected</span>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {candidates.map((c) => (
              <li key={c.property}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-card-hover">
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
                    className="accent-[hsl(var(--primary))]"
                  />
                  <Favicon domain={c.domain} size={16} />
                  <span className="font-medium">{c.domain}</span>
                  <span className="ml-auto truncate text-xs text-subtle">{c.property}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3">
            <Feedback state={state} />
            <SubmitButton pending={pending}>Import {selected.size || ""}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
