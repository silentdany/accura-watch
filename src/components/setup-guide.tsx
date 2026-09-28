import { ChevronRight } from "lucide-react";
import type { Locale } from "@/i18n";

type Provider = "google" | "posthog" | "sentry" | "dataforseo" | "openpagerank" | "ahrefs";
type Guide = { title: string; steps: React.ReactNode[] };

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="link font-medium">
      {children}
    </a>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[12.5px] text-foreground">{children}</code>;
}

const GSC_API = "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com";

function guidesFr(redirectUri: string): Record<Provider, Guide[]> {
  return {
    google: [
      {
        title: "Se connecter avec Google (OAuth)",
        steps: [
          <>
            Dans <A href={GSC_API}>Google Cloud</A>, choisis ou crée un projet et active l&rsquo;<b>API Google Search Console</b>.
          </>,
          <>
            Dans <A href="https://console.cloud.google.com/auth/overview">Google Auth Platform</A>, configure l&rsquo;écran de consentement (audience <b>Externe</b>), puis dans{" "}
            <b>Accès aux données</b> ajoute le scope <C>…/auth/webmasters.readonly</C>.
          </>,
          <>
            Dans <b>Audience</b>, passe l&rsquo;application <b>En production</b> : en mode <i>Test</i>, la connexion expire au bout de 7 jours. L&rsquo;avertissement « application non
            vérifiée » est normal pour ton propre compte.
          </>,
          <>
            <b>Clients → Créer un client → Application Web</b>, avec l&rsquo;URI de redirection autorisée <C>{redirectUri}</C>.
          </>,
          <>
            Ajoute <C>GOOGLE_CLIENT_ID</C> et <C>GOOGLE_CLIENT_SECRET</C> aux variables d&rsquo;environnement de ton hébergeur, puis redéploie.
          </>,
          <>
            Clique sur <b>Se connecter avec Google</b> et <b>coche « Afficher les données Search Console »</b> sur l&rsquo;écran Google. Déjà connecté sans cette case ? Retire
            l&rsquo;accès sur <A href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</A> puis reconnecte-toi.
          </>,
        ],
      },
      {
        title: "Avec un compte de service (clé JSON)",
        steps: [
          <>
            Active l&rsquo;<A href={GSC_API}>API Search Console</A> dans un projet Google Cloud.
          </>,
          <>
            <A href="https://console.cloud.google.com/iam-admin/serviceaccounts">IAM → Comptes de service</A> : crées-en un (aucun rôle nécessaire).
          </>,
          <>
            Ouvre-le → <b>Clés → Ajouter une clé → Créer une clé → JSON</b>. Google ne montre la clé privée qu&rsquo;une seule fois : si elle est perdue ou tronquée, crée-en une
            nouvelle et supprime l&rsquo;ancienne.
          </>,
          <>
            Dans <A href="https://search.google.com/search-console/users">Search Console → Paramètres → Utilisateurs et autorisations</A>, ajoute l&rsquo;adresse{" "}
            <C>client_email</C> de la clé comme utilisateur <b>Restreint</b> sur chaque propriété.
          </>,
          <>Colle le fichier JSON en entier ci-dessous, sans le modifier.</>,
        ],
      },
    ],
    posthog: [
      {
        title: "Clé API personnelle",
        steps: [
          <>
            Ouvre <A href="https://us.posthog.com/settings/user-api-keys">Paramètres → Clés API personnelles</A> (
            <A href="https://eu.posthog.com/settings/user-api-keys">version Europe</A>) → <b>Créer une clé</b>.
          </>,
          <>
            Accès : <b>tous les projets</b> de l&rsquo;organisation, pour que Watch relie chaque site à son projet.
          </>,
          <>
            Pas de préréglage : coche seulement <C>project:read</C> et <C>query:read</C>.
          </>,
          <>
            Colle la clé <C>phx_…</C> ci-dessous et choisis la région de ton compte. Une clé de projet (<C>phc_…</C>) ne permet pas de lire les données.
          </>,
        ],
      },
    ],
    sentry: [
      {
        title: "Jeton d'accès personnel",
        steps: [
          <>
            Ouvre <A href="https://sentry.io/settings/account/api/auth-tokens/">Paramètres du compte → Jetons personnels</A> → <b>Créer un jeton</b>.
          </>,
          <>
            Droits : <C>org:read</C>, <C>project:read</C>, <C>event:read</C>.
          </>,
          <>
            Les jetons d&rsquo;organisation (<C>sntrys_…</C>) ne peuvent pas lire les bugs. Données en Europe : mets <C>https://de.sentry.io</C> comme hôte.
          </>,
        ],
      },
    ],
    dataforseo: [
      {
        title: "Identifiants API",
        steps: [
          <>
            Crée un compte sur <A href="https://app.dataforseo.com/register">dataforseo.com</A> et ajoute un peu de crédit (paiement à l&rsquo;usage, dépôt minimum 50 $).
          </>,
          <>
            Ouvre <A href="https://app.dataforseo.com/api-access">API Access</A> : le <b>mot de passe API</b> y est généré, il est différent de celui de ton compte.
          </>,
        ],
      },
    ],
    ahrefs: [
      {
        title: "Clé API gratuite",
        steps: [
          <>
            Dans Ahrefs, ouvre <A href="https://app.ahrefs.com/account/api-keys">Paramètres du compte → Clés API</A> et crée une clé.
          </>,
          <>Watch n&rsquo;appelle que l&rsquo;accès gratuit au Domain Rating : aucun crédit n&rsquo;est consommé.</>,
        ],
      },
    ],
    openpagerank: [
      {
        title: "Clé API gratuite",
        steps: [
          <>
            Crée un compte gratuit sur <A href="https://www.domcop.com/openpagerank/">domcop.com/openpagerank</A>.
          </>,
          <>Copie la clé API depuis ton tableau de bord et colle-la ci-dessous.</>,
        ],
      },
    ],
  };
}

function guidesEn(redirectUri: string): Record<Provider, Guide[]> {
  return {
    google: [
      {
        title: "Sign in with Google (OAuth)",
        steps: [
          <>
            In <A href={GSC_API}>Google Cloud</A>, pick or create a project and enable the <b>Google Search Console API</b>.
          </>,
          <>
            In <A href="https://console.cloud.google.com/auth/overview">Google Auth Platform</A>, configure the consent screen (audience <b>External</b>), then in{" "}
            <b>Data access</b> add the scope <C>…/auth/webmasters.readonly</C>.
          </>,
          <>
            In <b>Audience</b>, set the publishing status to <b>In production</b>: in <i>Testing</i>, the connection expires after 7 days. The &ldquo;unverified app&rdquo; warning is
            fine for your own account.
          </>,
          <>
            <b>Clients → Create client → Web application</b>, with the authorized redirect URI <C>{redirectUri}</C>.
          </>,
          <>
            Set <C>GOOGLE_CLIENT_ID</C> and <C>GOOGLE_CLIENT_SECRET</C> in your host&rsquo;s environment variables and redeploy.
          </>,
          <>
            Click <b>Sign in with Google</b> and <b>tick &ldquo;View Search Console data&rdquo;</b> on the Google screen. Already connected without it? Remove access at{" "}
            <A href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</A> and reconnect.
          </>,
        ],
      },
      {
        title: "With a service account (JSON key)",
        steps: [
          <>
            Enable the <A href={GSC_API}>Search Console API</A> in a Google Cloud project.
          </>,
          <>
            <A href="https://console.cloud.google.com/iam-admin/serviceaccounts">IAM → Service accounts</A>: create one (no role needed).
          </>,
          <>
            Open it → <b>Keys → Add key → Create new key → JSON</b>. Google shows the private key only once: if yours is lost or truncated, create a new key and delete the old
            one.
          </>,
          <>
            In <A href="https://search.google.com/search-console/users">Search Console → Settings → Users and permissions</A>, add the key&rsquo;s <C>client_email</C> as a{" "}
            <b>Restricted</b> user on each property.
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
            Open <A href="https://us.posthog.com/settings/user-api-keys">Settings → Personal API keys</A> (<A href="https://eu.posthog.com/settings/user-api-keys">EU</A>) →{" "}
            <b>Create personal API key</b>.
          </>,
          <>
            Access: <b>all projects</b> of the organization, so Watch can link each site to its project.
          </>,
          <>
            No preset: only tick <C>project:read</C> and <C>query:read</C>.
          </>,
          <>
            Paste the <C>phx_…</C> key below and pick your account&rsquo;s region. A project key (<C>phc_…</C>) can&rsquo;t read data.
          </>,
        ],
      },
    ],
    sentry: [
      {
        title: "Personal auth token",
        steps: [
          <>
            Open <A href="https://sentry.io/settings/account/api/auth-tokens/">User settings → Personal Tokens</A> → <b>Create New Token</b>.
          </>,
          <>
            Scopes: <C>org:read</C>, <C>project:read</C>, <C>event:read</C>.
          </>,
          <>
            Organization tokens (<C>sntrys_…</C>) can&rsquo;t read bugs. EU data residency: use <C>https://de.sentry.io</C> as the host.
          </>,
        ],
      },
    ],
    dataforseo: [
      {
        title: "API credentials",
        steps: [
          <>
            Sign up at <A href="https://app.dataforseo.com/register">dataforseo.com</A> and add a little credit (pay as you go, $50 minimum deposit).
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
          <>Watch only calls the free Domain Rating endpoint: no credits are used.</>,
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

export function SetupGuide({ provider, redirectUri, locale, title }: { provider: Provider; redirectUri: string; locale: Locale; title: string }) {
  const list = (locale === "fr" ? guidesFr : guidesEn)(redirectUri)[provider];
  return (
    <details className="group rounded-xl border border-border bg-muted/50">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground">
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        {title}
      </summary>
      <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
        {list.map((g) => (
          <div key={g.title}>
            {list.length > 1 ? <p className="mb-2 text-sm font-semibold">{g.title}</p> : null}
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-subtle">
              {g.steps.map((s, k) => (
                <li key={k}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </details>
  );
}
