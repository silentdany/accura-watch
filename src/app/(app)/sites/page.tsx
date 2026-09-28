import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { gscImportCandidates, loadCatalogs } from "@/lib/sites";
import { getGoogleCreds } from "@/lib/integrations";
import { errorMessage } from "@/lib/http";
import { getI18n } from "@/i18n/server";
import { Card, CardHeader, Empty, Notice, PageHeader, Section } from "@/components/ui";
import { AutoMatchButton, SyncButton } from "@/components/forms";
import { AddSiteForm, GscImportForm, SiteEditor, type CatalogOptions } from "@/components/site-editors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.sites.title };
}

async function ImportPanel() {
  const { t } = await getI18n();
  if (!(await getGoogleCreds())) {
    return (
      <Empty>
        <Link href="/settings#google" className="link font-medium">
          {t.sites.connectGoogleFirst}
        </Link>
      </Empty>
    );
  }
  try {
    const candidates = (await gscImportCandidates()).filter((c) => !c.alreadyWatched);
    if (!candidates.length) return <Empty>{t.sites.allImported}</Empty>;
    return <GscImportForm candidates={candidates} />;
  } catch (e) {
    return <Empty>{errorMessage(e)}</Empty>;
  }
}

export default async function SitesPage() {
  const [{ t }, sites, catalogs] = await Promise.all([
    getI18n(),
    prisma.site.findMany({ orderBy: [{ active: "desc" }, { pinned: "desc" }, { name: "asc" }], include: { syncStates: true } }),
    loadCatalogs(),
  ]);
  const s = t.sites;

  const options: CatalogOptions = {
    gsc: catalogs.gsc?.map((p) => ({ value: p.siteUrl, label: p.siteUrl })) ?? null,
    posthog: catalogs.posthog?.map((p) => ({ value: p.id, label: `${p.name} (#${p.id})` })) ?? null,
    sentry: catalogs.sentry?.map((p) => ({ value: p.slug, label: p.name === p.slug ? p.slug : `${p.name} (${p.slug})` })) ?? null,
  };

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        flush
        title={s.title}
        subtitle={s.subtitle}
        right={
          <>
            <AutoMatchButton />
            <SyncButton label={t.sync.all} />
          </>
        }
      />

      {Object.keys(catalogs.errors).length ? (
        <Notice tone="warning">
          <p className="font-medium">{s.catalogErrors}</p>
          {Object.entries(catalogs.errors).map(([k, v]) => (
            <p key={k} className="break-words text-muted-foreground">
              <span className="font-medium text-foreground">{(t.sources as Record<string, string>)[k] ?? k}</span> · {v}
            </p>
          ))}
        </Notice>
      ) : null}

      <Section title={s.watched(sites.length)}>
        <div className="flex flex-col gap-3">
          {sites.map((x) => (
            <SiteEditor
              key={x.id}
              catalogs={options}
              site={{
                id: x.id,
                slug: x.slug,
                name: x.name,
                domain: x.domain,
                url: x.url,
                gscProperty: x.gscProperty,
                posthogProjectId: x.posthogProjectId,
                posthogHost: x.posthogHost,
                sentryProject: x.sentryProject,
                active: x.active,
                pinned: x.pinned,
                sync: x.syncStates.map((st) => ({ source: st.source, ok: st.ok, error: st.error, lastRunAt: st.lastRunAt.toISOString() })),
              }}
            />
          ))}
          {!sites.length ? (
            <Card>
              <Empty>{s.empty}</Empty>
            </Card>
          ) : null}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={s.import} hint={s.importHint} dot="var(--c-gsc)" />
          <ImportPanel />
        </Card>
        <Card>
          <CardHeader title={s.add} hint={s.addHint} />
          <AddSiteForm />
        </Card>
      </div>
    </div>
  );
}
