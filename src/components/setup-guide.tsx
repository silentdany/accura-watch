import { ChevronRight } from "lucide-react";

type Provider = "google" | "posthog" | "sentry" | "dataforseo" | "openpagerank" | "ahrefs";
type Guide = { title: string; steps: React.ReactNode[] };

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="break-all text-foreground">{children}</code>;
}

function guides(redirectUri: string): Record<Provider, Guide[]> {
  return {
    google: [
      {
        title: "Sign in with Google (OAuth)",
        steps: [
          <>
            In <A href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com">Google Cloud</A>, pick or create a project and enable the{" "}
            <b>Google Search Console API</b>.
          </>,
          <>
            <A href="https://console.cloud.google.com/auth/overview">Google Auth Platform</A>: configure the consent screen (audience <b>External</b>), then in{" "}
            <b>Data access</b> add the scope <C>…/auth/webmasters.readonly</C>.
          </>,
          <>
            In <b>Audience</b>, set the publishing status to <b>In production</b>: in <i>Testing</i>, refresh tokens expire after 7 days. The &ldquo;unverified app&rdquo;
            warning is fine for your own account.
          </>,
          <>
            <b>Clients → Create client → Web application</b>, with the authorized redirect URI <C>{redirectUri}</C>.
          </>,
          <>
            Set <C>GOOGLE_CLIENT_ID</C> and <C>GOOGLE_CLIENT_SECRET</C> in your host&rsquo;s environment variables and redeploy.
          </>,
          <>
            Click <b>Connect with Google</b> and <b>tick &ldquo;View Search Console data&rdquo;</b> on the consent screen. Already connected without it? Remove access at{" "}
            <A href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</A> and reconnect.
          </>,
        ],
      },
      {
        title: "Service account (JSON key)",
        steps: [
          <>
            Enable the <A href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com">Search Console API</A> in a Google Cloud project.
          </>,
          <>
            <A href="https://console.cloud.google.com/iam-admin/serviceaccounts">IAM → Service accounts</A> → create one (no role needed).
          </>,
          <>
            Open it → <b>Keys → Add key → Create new key → JSON</b>. Google shows the private key only once: if yours is lost or truncated, create a new key and delete
            the old one.
          </>,
          <>
            In <A href="https://search.google.com/search-console/users">Search Console → Settings → Users and permissions</A>, add the key&rsquo;s{" "}
            <C>client_email</C> as a <b>Restricted</b> user on each property.
          </>,
          <>Paste the whole JSON file below, unchanged.</>,
        ],
      },
    ],
    posthog: [
      {
        title: "Personal API key",
        steps: [
          <>
            Open <A href="https://us.posthog.com/settings/user-api-keys">Settings → Personal API keys</A> (
            <A href="https://eu.posthog.com/settings/user-api-keys">EU</A>) → <b>Create personal API key</b>.
          </>,
          <>
            Access: <b>all projects</b> of the organization, so sites can be matched to projects by name.
          </>,
          <>
            No preset: pick the scopes <C>project:read</C> and <C>query:read</C>.
          </>,
          <>
            Paste the <C>phx_…</C> key below and pick the region your account lives in. A project key (<C>phc_…</C>) can&rsquo;t read data.
          </>,
        ],
      },
    ],
    sentry: [
      {
        title: "User auth token",
        steps: [
          <>
            Open <A href="https://sentry.io/settings/account/api/auth-tokens/">User settings → Personal Tokens</A> → <b>Create New Token</b>.
          </>,
          <>
            Scopes: <C>org:read</C>, <C>project:read</C>, <C>event:read</C>.
          </>,
          <>
            Organization tokens (<C>sntrys_…</C>) can&rsquo;t read issues. EU data residency: use <C>https://de.sentry.io</C> as the host.
          </>,
        ],
      },
    ],
    dataforseo: [
      {
        title: "API credentials",
        steps: [
          <>
            Sign up at <A href="https://app.dataforseo.com/register">dataforseo.com</A> and add a small balance (pay-as-you-go).
          </>,
          <>
            Open <A href="https://app.dataforseo.com/api-access">API Access</A>: the <b>API password</b> is generated there and differs from your account password.
          </>,
        ],
      },
    ],
    ahrefs: [
      {
        title: "Free API key",
        steps: [
          <>
            In Ahrefs, open <A href="https://app.ahrefs.com/account/api-keys">Account settings → API keys</A> and create a key.
          </>,
          <>Only the free Domain Rating endpoint is called: no API units are used.</>,
        ],
      },
    ],
    openpagerank: [
      {
        title: "Free API key",
        steps: [
          <>
            Create a free account at <A href="https://www.domcop.com/openpagerank/">domcop.com/openpagerank</A>.
          </>,
          <>Copy the API key from your dashboard and paste it below.</>,
        ],
      },
    ],
  };
}

export function SetupGuide({ provider, redirectUri }: { provider: Provider; redirectUri: string }) {
  const list = guides(redirectUri)[provider];
  return (
    <details className="group rounded-md border border-border text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-medium text-muted-foreground hover:text-foreground">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        How to connect
      </summary>
      <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
        {list.map((g) => (
          <div key={g.title}>
            {list.length > 1 ? <p className="mb-1.5 font-medium text-foreground">{g.title}</p> : null}
            <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
              {g.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </details>
  );
}
