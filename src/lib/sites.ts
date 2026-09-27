import type { Site } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { matchKey, nameFromDomain, normalizeDomain, slugify, urlFor } from "@/lib/domain";
import { listGscProperties, type GscProperty } from "@/lib/providers/google";
import { listPosthogProjects, type PosthogProject } from "@/lib/providers/posthog";
import { listSentryProjects, type SentryProject } from "@/lib/providers/sentry";
import { getGoogleCreds, getPosthogCreds, getSentryCreds } from "@/lib/integrations";

export const siteInput = z.object({
  domain: z.string().min(3).describe("Domain or URL, e.g. example.com"),
  name: z.string().min(1).max(80).optional(),
  url: z.string().url().optional().describe("Public URL used for uptime checks (default https://<domain>)"),
  gscProperty: z.string().optional().describe('Search Console property, e.g. "sc-domain:example.com"'),
  posthogProjectId: z.string().regex(/^\d+$/).optional(),
  posthogHost: z.string().optional().describe("Filter PostHog events on this $host (shared projects)"),
  sentryProject: z.string().optional().describe("Sentry project slug"),
  pinned: z.boolean().optional(),
});
export type SiteInput = z.infer<typeof siteInput>;

export const siteUpdate = siteInput.partial().extend({
  active: z.boolean().optional(),
});
export type SiteUpdate = z.infer<typeof siteUpdate>;

const blankToNull = (v: string | undefined | null) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);

async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 100; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    const hit = await prisma.site.findUnique({ where: { slug } });
    if (!hit || hit.id === exceptId) return slug;
  }
  return `${root}-${Date.now()}`;
}

/** Find a site by id, slug, domain or URL. */
export async function resolveSite(ref: string): Promise<Site> {
  const domain = normalizeDomain(ref);
  const site = await prisma.site.findFirst({
    where: {
      OR: [{ id: ref }, { slug: ref.toLowerCase() }, ...(domain ? [{ domain }] : [])],
    },
  });
  if (!site) throw new Error(`Unknown site "${ref}". Use list_sites to see available sites.`);
  return site;
}

export async function createSite(input: SiteInput): Promise<Site> {
  const domain = normalizeDomain(input.domain);
  if (!domain) throw new Error(`Invalid domain "${input.domain}"`);
  const existing = await prisma.site.findUnique({ where: { domain } });
  if (existing) throw new Error(`${domain} is already watched (slug "${existing.slug}")`);
  const name = input.name?.trim() || nameFromDomain(domain);
  const suggestions = await suggestMappings([{ domain, name }]).catch(() => null);
  const s = suggestions?.[0];
  return prisma.site.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      domain,
      url: input.url ?? urlFor(input.domain.includes("://") ? input.domain : domain),
      gscProperty: blankToNull(input.gscProperty) ?? s?.gscProperty ?? null,
      posthogProjectId: blankToNull(input.posthogProjectId) ?? s?.posthogProjectId ?? null,
      posthogHost: blankToNull(input.posthogHost) ?? null,
      sentryProject: blankToNull(input.sentryProject) ?? s?.sentryProject ?? null,
      pinned: input.pinned ?? false,
    },
  });
}

export async function updateSite(id: string, input: SiteUpdate): Promise<Site> {
  const data: Record<string, unknown> = {};
  if (input.domain !== undefined) {
    const domain = normalizeDomain(input.domain);
    if (!domain) throw new Error(`Invalid domain "${input.domain}"`);
    data.domain = domain;
  }
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.url !== undefined) data.url = input.url;
  if (input.gscProperty !== undefined) data.gscProperty = blankToNull(input.gscProperty);
  if (input.posthogProjectId !== undefined) data.posthogProjectId = blankToNull(input.posthogProjectId);
  if (input.posthogHost !== undefined) data.posthogHost = blankToNull(input.posthogHost);
  if (input.sentryProject !== undefined) data.sentryProject = blankToNull(input.sentryProject);
  if (input.pinned !== undefined) data.pinned = input.pinned;
  if (input.active !== undefined) data.active = input.active;
  const site = await prisma.site.update({ where: { id }, data });
  // Mapping changed → forget sync state so the next run backfills history.
  const remapped = (["gscProperty", "posthogProjectId", "posthogHost", "sentryProject"] as const).filter(
    (k) => k in data,
  );
  if (remapped.length) {
    const sources = remapped.map((k) => (k === "gscProperty" ? "gsc" : k === "sentryProject" ? "sentry" : "posthog"));
    await prisma.syncState.deleteMany({ where: { siteId: id, source: { in: sources } } });
  }
  return site;
}

export async function deleteSite(id: string): Promise<void> {
  await prisma.site.delete({ where: { id } });
}

// ─── Provider catalogs + auto-matching ─────────────────────────────────────

export type Catalogs = {
  gsc: GscProperty[] | null;
  posthog: PosthogProject[] | null;
  sentry: SentryProject[] | null;
  errors: Record<string, string>;
};

/** Lists properties/projects from every connected provider (for selects + matching). */
export async function loadCatalogs(): Promise<Catalogs> {
  const [g, p, s] = await Promise.all([getGoogleCreds(), getPosthogCreds(), getSentryCreds()]);
  const errors: Record<string, string> = {};
  const safe = async <T,>(key: string, enabled: boolean, fn: () => Promise<T>): Promise<T | null> => {
    if (!enabled) return null;
    try {
      return await fn();
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : String(e);
      return null;
    }
  };
  const [gsc, posthog, sentry] = await Promise.all([
    safe("gsc", !!g, listGscProperties),
    safe("posthog", !!p, listPosthogProjects),
    safe("sentry", !!s, listSentryProjects),
  ]);
  return { gsc, posthog, sentry, errors };
}

/** Prefer domain properties over URL-prefix ones, https over http. */
function gscScore(siteUrl: string): number {
  if (siteUrl.startsWith("sc-domain:")) return 3;
  if (siteUrl.startsWith("https://")) return 2;
  return 1;
}

export function bestGscProperty(domain: string, props: GscProperty[]): string | null {
  const matches = props.filter((p) => normalizeDomain(p.siteUrl) === domain);
  matches.sort((a, b) => gscScore(b.siteUrl) - gscScore(a.siteUrl));
  return matches[0]?.siteUrl ?? null;
}

function bestByName<T>(items: T[], labels: (t: T) => string[], domain: string, name: string): T | null {
  const keys = new Set([matchKey(domain), matchKey(domain.split(".")[0]), matchKey(name)]);
  return items.find((it) => labels(it).some((l) => keys.has(matchKey(l)))) ?? null;
}

export type Suggestion = {
  domain: string;
  gscProperty: string | null;
  posthogProjectId: string | null;
  sentryProject: string | null;
};

export async function suggestMappings(
  targets: { domain: string; name: string }[],
  catalogs?: Catalogs,
): Promise<Suggestion[]> {
  const cat = catalogs ?? (await loadCatalogs());
  return targets.map(({ domain, name }) => ({
    domain,
    gscProperty: cat.gsc ? bestGscProperty(domain, cat.gsc) : null,
    posthogProjectId: cat.posthog ? (bestByName(cat.posthog, (p) => [p.name], domain, name)?.id ?? null) : null,
    sentryProject: cat.sentry ? (bestByName(cat.sentry, (p) => [p.slug, p.name], domain, name)?.slug ?? null) : null,
  }));
}

/** Fill empty mappings on existing sites from provider catalogs. Returns the number of fields set. */
export async function autoMatchSites(): Promise<number> {
  const cat = await loadCatalogs();
  const sites = await prisma.site.findMany();
  const suggestions = await suggestMappings(sites.map((s) => ({ domain: s.domain, name: s.name })), cat);
  let changed = 0;
  for (const [i, site] of sites.entries()) {
    const s = suggestions[i];
    const patch: SiteUpdate = {};
    if (!site.gscProperty && s.gscProperty) patch.gscProperty = s.gscProperty;
    if (!site.posthogProjectId && s.posthogProjectId) patch.posthogProjectId = s.posthogProjectId;
    if (!site.sentryProject && s.sentryProject) patch.sentryProject = s.sentryProject;
    const n = Object.keys(patch).length;
    if (n) {
      await updateSite(site.id, patch);
      changed += n;
    }
  }
  return changed;
}

export type ImportCandidate = { property: string; domain: string; alreadyWatched: boolean };

/** Search Console properties, deduplicated by domain. */
export async function gscImportCandidates(): Promise<ImportCandidate[]> {
  const props = await listGscProperties();
  const watched = new Set((await prisma.site.findMany({ select: { domain: true } })).map((s) => s.domain));
  const byDomain = new Map<string, string>();
  for (const p of props) {
    const d = normalizeDomain(p.siteUrl);
    if (!d) continue;
    const cur = byDomain.get(d);
    if (!cur || gscScore(p.siteUrl) > gscScore(cur)) byDomain.set(d, p.siteUrl);
  }
  return [...byDomain.entries()]
    .map(([domain, property]) => ({ domain, property, alreadyWatched: watched.has(domain) }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/** Import Search Console properties as sites (all new ones when `properties` is omitted). */
export async function importFromGsc(properties?: string[]): Promise<{ created: Site[]; skipped: string[] }> {
  const candidates = await gscImportCandidates();
  const wanted = properties?.length
    ? candidates.filter((c) => properties.includes(c.property) || properties.includes(c.domain))
    : candidates;
  const catalogs = await loadCatalogs();
  const created: Site[] = [];
  const skipped: string[] = [];
  for (const c of wanted) {
    if (c.alreadyWatched) {
      skipped.push(c.domain);
      continue;
    }
    const name = nameFromDomain(c.domain);
    const [s] = await suggestMappings([{ domain: c.domain, name }], catalogs);
    created.push(
      await prisma.site.create({
        data: {
          name,
          slug: await uniqueSlug(name),
          domain: c.domain,
          url: c.property.startsWith("http") ? urlFor(c.property) : `https://${c.domain}`,
          gscProperty: c.property,
          posthogProjectId: s.posthogProjectId,
          sentryProject: s.sentryProject,
        },
      }),
    );
  }
  return { created, skipped };
}
