import { fetchJson } from "@/lib/http";
import { getPosthogCreds } from "@/lib/integrations";

export type PosthogProject = { id: string; name: string };

async function creds() {
  const c = await getPosthogCreds();
  if (!c) throw new Error("PostHog is not connected");
  return c;
}

export async function listPosthogProjects(): Promise<PosthogProject[]> {
  const c = await creds();
  const { data } = await fetchJson<{ results?: { id: number; name: string }[] }>(
    `${c.host}/api/projects/?limit=200`,
    { headers: { Authorization: `Bearer ${c.apiKey}` }, label: "PostHog" },
  );
  return (data.results ?? []).map((p) => ({ id: String(p.id), name: p.name }));
}

export type HogqlResult = { columns: string[]; results: unknown[][] };

/** Run a HogQL (read-only SQL) query against a PostHog project. */
export async function runHogql(projectId: string, query: string): Promise<HogqlResult> {
  if (!/^\d+$/.test(projectId)) throw new Error("Invalid PostHog project id");
  const c = await creds();
  const { data } = await fetchJson<{ columns?: string[]; results?: unknown[][] }>(
    `${c.host}/api/projects/${projectId}/query/`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name: "accura-watch" }),
      timeoutMs: 45_000,
      label: "PostHog query",
    },
  );
  return { columns: data.columns ?? [], results: data.results ?? [] };
}

/** `AND properties.$host = '...'` clause for projects that track several sites. */
export function hostClause(host: string | null | undefined): string {
  if (!host) return "";
  const clean = host.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(clean)) throw new Error("Invalid PostHog host filter");
  return ` AND properties.$host IN ('${clean}', 'www.${clean.replace(/^www\./, "")}')`;
}
