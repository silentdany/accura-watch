import type { Metadata } from "next";
import { CheckCircle2, Circle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { integrationStatuses } from "@/lib/integrations";
import { googleOAuthApp, googleRedirectUri } from "@/lib/providers/google";
import { appUrl } from "@/lib/env";
import { ago } from "@/lib/dates";
import { TOOLS } from "@/lib/mcp/tools";
import { revokeTokenAction } from "@/app/actions";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui";
import { CopyField } from "@/components/forms";
import { CreateTokenForm, IntegrationForm } from "@/components/settings-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

const DOT: Record<string, string> = {
  google: "var(--c-gsc)",
  posthog: "var(--c-posthog)",
  sentry: "var(--c-sentry)",
  dataforseo: "var(--c-seo)",
  openpagerank: "var(--c-seo)",
  ahrefs: "var(--c-seo)",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [integrations, tokens] = await Promise.all([integrationStatuses(), prisma.apiToken.findMany({ orderBy: { createdAt: "desc" } })]);
  const oauthApp = googleOAuthApp();
  const mcpUrl = `${appUrl()}/api/mcp`;

  return (
    <>
      <PageHeader title="Settings" subtitle="Data providers and AI agent access. Credentials are encrypted at rest (AES-256-GCM)." />

      {sp.error ? <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{sp.error}</p> : null}
      {sp.connected ? <p className="mb-4 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">Connected {sp.connected} ✓</p> : null}

      <h2 className="eyebrow mb-3">Integrations</h2>
      <div className="mb-10 grid gap-3 xl:grid-cols-2">
        {integrations.map((i) => (
          <Card key={i.id} id={i.id} className="scroll-mt-20">
            <CardHeader
              dot={DOT[i.id]}
              title={i.label}
              hint={i.feeds}
              right={
                i.connected ? (
                  <Pill tone="good">
                    <CheckCircle2 className="h-3 w-3" /> {i.source === "env" ? "via env" : "connected"}
                  </Pill>
                ) : (
                  <Pill>
                    <Circle className="h-3 w-3" /> not connected
                  </Pill>
                )
              }
            />
            <div className="flex flex-col gap-4 p-4">
              {i.detail ? <p className="text-xs text-muted-foreground">{i.detail}</p> : null}
              {i.id === "google" ? (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-sm font-medium">Recommended: sign in with Google</p>
                  {oauthApp ? (
                    <>
                      <p className="text-xs text-muted-foreground">Read-only access to every property of your Google account — no per-property setup.</p>
                      <a href="/api/integrations/google/start" className="btn btn-primary self-start">
                        {i.detail?.startsWith("OAuth") ? "Reconnect Google" : "Connect with Google"}
                      </a>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Set <code className="text-foreground">GOOGLE_CLIENT_ID</code> and <code className="text-foreground">GOOGLE_CLIENT_SECRET</code> (Google Cloud → OAuth client,
                      Web application) with redirect URI:
                      <div className="mt-1">
                        <CopyField value={googleRedirectUri()} />
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              {i.source === "env" ? (
                <p className="text-xs text-muted-foreground">Configured through environment variables. Saving here overrides them.</p>
              ) : null}
              <IntegrationForm provider={i.id} connected={i.source === "database"} config={i.config} />
            </div>
          </Card>
        ))}
      </div>

      <h2 id="mcp" className="eyebrow mb-3 scroll-mt-20">
        MCP &amp; API
      </h2>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader title="Connect an AI agent" hint="Streamable HTTP MCP server — works with Claude Code, Claude Desktop, Cursor, ChatGPT…" />
          <div className="flex flex-col gap-4 p-4">
            <div>
              <p className="label">MCP endpoint</p>
              <CopyField value={mcpUrl} />
            </div>
            <CreateTokenForm mcpUrl={mcpUrl} />
            <div>
              <p className="label">Also available</p>
              <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                <li>
                  REST: <code className="text-foreground">GET /api/v1</code> lists tools, <code className="text-foreground">POST /api/v1/tools/&lt;name&gt;</code> calls one (same Bearer token)
                </li>
                <li>
                  <a href="/llms.txt" className="text-primary hover:underline">
                    /llms.txt
                  </a>{" "}
                  — machine-readable description of this instance
                </li>
              </ul>
            </div>
          </div>
        </Card>
        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader title={`Tokens · ${tokens.length}`} />
            {tokens.length ? (
              <ul className="divide-y divide-border/70">
                {tokens.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="font-medium">{t.name}</span>
                    <code className="text-xs text-subtle">{t.prefix}…</code>
                    <span className="ml-auto text-xs text-muted-foreground">{t.lastUsedAt ? `used ${ago(t.lastUsedAt)}` : "never used"}</span>
                    <form action={revokeTokenAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="btn btn-danger px-2 py-1 text-xs">
                        Revoke
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No tokens yet.</p>
            )}
          </Card>
          <Card>
            <CardHeader title={`Tools · ${TOOLS.length}`} hint="Everything the dashboard does, an agent can do" />
            <ul className="grid gap-x-4 gap-y-1.5 p-4 text-xs sm:grid-cols-2">
              {TOOLS.map((t) => (
                <li key={t.name} className="truncate" title={t.description}>
                  <code className="text-foreground">{t.name}</code> <span className="text-subtle">— {t.title}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
