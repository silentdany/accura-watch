import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { gscImportCandidates, loadCatalogs } from "@/lib/sites";
import { getGoogleCreds } from "@/lib/integrations";
import { errorMessage } from "@/lib/http";
import { Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { AutoMatchButton, SyncButton } from "@/components/forms";
import { AddSiteForm, GscImportForm, SiteEditor, type CatalogOptions } from "@/components/site-editors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata: Metadata = { title: "Sites" };

async function ImportPanel() {
  if (!(await getGoogleCreds())) {
    return (
      <Empty>
        <Link href="/settings#google" className="text-primary hover:underline">
          Connect Google Search Console
        </Link>{" "}
        to import your properties in one click.
      </Empty>
    );
  }
  try {
    const candidates = (await gscImportCandidates()).filter((c) => !c.alreadyWatched);
    if (!candidates.length) return <Empty>All your Search Console properties are already watched.</Empty>;
    return <GscImportForm candidates={candidates} />;
  } catch (e) {
    return <Empty>Search Console error: {errorMessage(e)}</Empty>;
  }
}

export default async function SitesPage() {
  const [sites, catalogs] = await Promise.all([
    prisma.site.findMany({ orderBy: [{ active: "desc" }, { pinned: "desc" }, { name: "asc" }], include: { syncStates: true } }),
    loadCatalogs(),
  ]);

  const options: CatalogOptions = {
    gsc: catalogs.gsc?.map((p) => ({ value: p.siteUrl, label: p.siteUrl })) ?? null,
    posthog: catalogs.posthog?.map((p) => ({ value: p.id, label: `${p.name} (#${p.id})` })) ?? null,
    sentry: catalogs.sentry?.map((p) => ({ value: p.slug, label: p.name === p.slug ? p.slug : `${p.name} (${p.slug})` })) ?? null,
  };

  return (
    <>
      <PageHeader
        title="Sites"
        subtitle="Add sites by hand or import them from Search Console, then map each one to its analytics and error-tracking projects."
        right={
          <>
            <AutoMatchButton />
            <SyncButton label="Sync all" />
          </>
        }
      />

      {Object.keys(catalogs.errors).length ? (
        <div className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {Object.entries(catalogs.errors).map(([k, v]) => (
            <p key={k}>
              <span className="font-medium uppercase">{k}</span>: {v}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mb-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Import from Search Console" hint="Domain properties are preferred over URL-prefix ones" dot="var(--c-gsc)" />
          <ImportPanel />
        </Card>
        <Card>
          <CardHeader title="Add a site" hint="Any domain — Search Console not required" />
          <AddSiteForm />
        </Card>
      </div>

      <h2 className="eyebrow mb-3">Watched sites · {sites.length}</h2>
      <div className="flex flex-col gap-3">
        {sites.map((s) => (
          <SiteEditor
            key={s.id}
            catalogs={options}
            site={{
              id: s.id,
              slug: s.slug,
              name: s.name,
              domain: s.domain,
              url: s.url,
              gscProperty: s.gscProperty,
              posthogProjectId: s.posthogProjectId,
              posthogHost: s.posthogHost,
              sentryProject: s.sentryProject,
              active: s.active,
              pinned: s.pinned,
              sync: s.syncStates.map((st) => ({ source: st.source, ok: st.ok, error: st.error, lastRunAt: st.lastRunAt.toISOString() })),
            }}
          />
        ))}
        {!sites.length ? (
          <Card>
            <Empty>No sites yet.</Empty>
          </Card>
        ) : null}
      </div>
    </>
  );
}
