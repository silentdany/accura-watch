import type { Metadata } from "next";
import { CheckCircle2, Circle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { integrationStatuses } from "@/lib/integrations";
import { googleOAuthApp, googleRedirectUri } from "@/lib/providers/google";
import { appUrl } from "@/lib/env";
import { TOOLS } from "@/lib/mcp/tools";
import { revokeTokenAction } from "@/app/actions";
import { getI18n, getTheme } from "@/i18n/server";
import { Badge, Card, CardHeader, Notice, PageHeader, Section } from "@/components/ui";
import { CopyField } from "@/components/forms";
import { CreateTokenForm, IntegrationForm } from "@/components/settings-forms";
import { SetupGuide } from "@/components/setup-guide";
import { LocaleSwitch, ThemeSwitch } from "@/components/prefs";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.settings.title };
}

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
  const [{ t, f, locale }, theme, integrations, tokens] = await Promise.all([
    getI18n(),
    getTheme(),
    integrationStatuses(),
    prisma.apiToken.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const s = t.settings;
  const oauthApp = googleOAuthApp();
  const mcpUrl = `${appUrl()}/api/mcp`;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader flush title={s.title} subtitle={s.subtitle} />

      {sp.error ? <Notice tone="bad">{sp.error}</Notice> : null}
      {sp.connected ? <Notice tone="good">{s.connectedAs(sp.connected === "google" ? t.sources.gsc : sp.connected)}</Notice> : null}

      <Section title={s.prefsTitle}>
        <Card className="flex flex-col divide-y divide-border">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <span className="font-medium">{s.language}</span>
            <LocaleSwitch />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <span className="font-medium">{s.theme}</span>
            <ThemeSwitch value={theme} withLabels />
          </div>
        </Card>
      </Section>

      <Section title={s.sourcesTitle} description={s.sourcesHint}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {integrations.map((i) => (
            <Card key={i.id} id={i.id} className="flex scroll-mt-24 flex-col">
              <CardHeader
                dot={DOT[i.id]}
                title={i.label.replace(/\s*\(free\)$/i, "")}
                hint={(s.what as Record<string, string>)[i.id]}
                right={
                  i.connected ? (
                    <Badge tone="good">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {i.source === "env" ? s.viaEnv : s.connected}
                    </Badge>
                  ) : (
                    <Badge>
                      <Circle className="h-3.5 w-3.5" aria-hidden /> {s.notConnected}
                    </Badge>
                  )
                }
              />
              <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-2">
                {i.detail ? <p className="text-[13px] text-muted-foreground">{i.detail}</p> : null}
                {i.id === "google" ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
                    <p className="font-semibold">{s.googleRecommended}</p>
                    {oauthApp ? (
                      <>
                        <p className="text-sm text-muted-foreground">{s.googleRecommendedBody}</p>
                        <a href="/api/integrations/google/start" className="btn btn-primary mt-1 self-start">
                          {i.detail?.startsWith("OAuth") ? s.reconnectGoogle : s.connectGoogle}
                        </a>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {s.googleEnvNeeded}
                        <div className="mt-2">
                          <CopyField value={googleRedirectUri()} />
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                {i.source === "env" ? <p className="text-[13px] text-muted-foreground">{s.envNote}</p> : null}
                <SetupGuide provider={i.id} redirectUri={googleRedirectUri()} locale={locale} title={s.howTo} />
                {i.id === "google" ? <p className="text-sm font-medium">{s.orServiceAccount}</p> : null}
                <div className="flex flex-1 flex-col">
                  <IntegrationForm provider={i.id} name={i.label} connected={i.source === "database"} config={i.config} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="agent" title={s.agentTitle} description={s.agentHint}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <div className="flex flex-col gap-5 p-5">
              <div>
                <p className="label">{s.mcpEndpoint}</p>
                <CopyField value={mcpUrl} />
              </div>
              <CreateTokenForm mcpUrl={mcpUrl} />
              <div className="text-[13px] text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">{s.alsoAvailable}</p>
                <p>{s.rest}</p>
                <p className="mt-1">
                  <a href="/llms.txt" className="link">
                    /llms.txt
                  </a>{" "}
                  · {s.llms}
                </p>
              </div>
            </div>
          </Card>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title={s.tokens(tokens.length)} />
              {tokens.length ? (
                <ul className="divide-y divide-border px-5 pb-3">
                  {tokens.map((tk) => (
                    <li key={tk.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                      <span className="font-medium">{tk.name}</span>
                      <code className="text-[13px] text-subtle">{tk.prefix}…</code>
                      <span className="ml-auto text-[13px] text-muted-foreground">{tk.lastUsedAt ? s.usedAgo(f.ago(tk.lastUsedAt)) : s.neverUsed}</span>
                      <form action={revokeTokenAction}>
                        <input type="hidden" name="id" value={tk.id} />
                        <button type="submit" className="btn btn-danger btn-sm">
                          {s.revoke}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 pb-5 text-sm text-muted-foreground">{s.noTokens}</p>
              )}
            </Card>
            <Card>
              <details className="group">
                <summary className="cursor-pointer list-none px-5 py-4 font-semibold">{s.tools(TOOLS.length)}</summary>
                <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 px-5 pb-5 text-[13px] sm:grid-cols-2">
                  {TOOLS.map((tool) => (
                    <li key={tool.name} className="truncate" title={tool.description}>
                      <code className="text-foreground">{tool.name}</code> <span className="text-muted-foreground">· {tool.title}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          </div>
        </div>
      </Section>
    </div>
  );
}
