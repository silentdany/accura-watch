# Accura Watch

**Accura Watch** — monitoring dashboard for Accura sites (`watch.accura.dev`).

Danny solo · V1 · Console graphite UI · Better Auth + Prisma wire.

---

## Stack

- **Next.js** App Router (TypeScript) + **React 19** + **Tailwind CSS 4**
- **Prisma** (`User`/`Session`/`Account`/`Verification` + `Site`/`MetricSnapshot`) → Postgres / Neon
- **Better Auth** email/password (`src/lib/auth.ts`) — solo `OWNER_EMAIL`
- Connectors: **health** + **Sentry** + **PostHog** + GSC / Ahrefs placeholders
- Cron: `GET /api/cron/collect` guarded by `CRON_SECRET` — writes `MetricSnapshot`
- Deploy: **Vercel** (`next.config.ts`, `vercel.json` hourly cron)

## Design tokens (Console graphite)

| Token | Value |
|-------|--------|
| Primary | `#3DDEA8` · `hsl(158 70% 55%)` |
| Background | `hsl(220 10% 7%)` |
| Shell | Sidebar **240px** + sticky topbar |

## Quick start

```bash
cp .env.example .env.local
# Fill DATABASE_URL, CRON_SECRET, BETTER_AUTH_*, OWNER_EMAIL

npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → redirected to `/login`.

### Build (Vercel)

```bash
npm run build
npm start
```

`postinstall` / `build` run `prisma generate`. Set `DATABASE_URL` on Vercel (Neon) before enabling DB reads/writes.

## Environment

| Variable | Role |
|----------|------|
| `DATABASE_URL` | Postgres (Neon) |
| `CRON_SECRET` | Bearer token for `/api/cron/collect` |
| `BETTER_AUTH_SECRET` | Auth secret (≥32 chars) |
| `BETTER_AUTH_URL` | Public app URL (`https://watch.accura.dev` in prod) |
| `OWNER_EMAIL` | Solo allowed email (default `dany@accura.dev`) |
| `NEXT_PUBLIC_APP_URL` | Public origin (`https://watch.accura.dev`) |
| `SENTRY_AUTH_TOKEN` | Optional — Sentry API token |
| `SENTRY_ORG` | Global org slug (default `accura-9m`) |
| `SENTRY_PROJECT` | Optional transitional fallback only — prefer `Site.config.sentryProject` |
| `POSTHOG_API_KEY` | Optional — PostHog personal API key |
| `POSTHOG_HOST` | PostHog API host (default `https://eu.posthog.com`; US: `https://app.posthog.com`) |

See `.env.example`.

## Routes

| Path | Description |
|------|-------------|
| `/` | Shell + KPI cards (auth required) |
| `/login` | Better Auth email/password |
| `/api/auth/*` | Better Auth handler |
| `/api/cron/collect` | Collect connectors → `MetricSnapshot` (`Authorization: Bearer $CRON_SECRET`) |

## Connectors

Registry: `src/lib/connectors/registry.ts`

- `health` — HEAD site URL, latency + up/down
- `sentry` — unresolved issues count per site via `Site.config.sentryProject` (brieform, directoryfast). Sites without that field are skipped. Dashboard KPI sums unresolved across configured sites.
- `posthog` — `activeUsers7d` + `pageviews7d` per site via `Site.config.posthogProjectId` (aliases: `posthogProject`, `projectId`). Env: `POSTHOG_API_KEY` (global) + `POSTHOG_HOST` (default EU). Sites without project id are skipped. Dashboard KPI sums `activeUsers7d` across configured sites.
- `gsc` / `ahrefs` — stubs returning `not configured`

### PostHog (per-site)

1. Set `POSTHOG_API_KEY` (Personal API Key) and optionally `POSTHOG_HOST` (`https://eu.posthog.com` default, or `https://app.posthog.com` for US).
2. Put the numeric project id on each watched site: `Site.config.posthogProjectId` (or aliases `posthogProject` / `projectId`).
3. Cron collects Trends via `POST /api/projects/{id}/query/` (`$pageview` math `total` / `unique`, fallback `dau`).
4. Project mapping from Danny is still pending — seed does **not** invent PostHog ids yet.

## Watched sites (seed)

| Slug | URL | Sentry project | PostHog project |
|------|-----|----------------|-----------------|
| `accura` | https://accura.dev | — | — (pending mapping) |
| `brieform` | https://brieform.app | `brieform` | — (pending mapping) |
| `directoryfast` | https://directoryfa.st | `directoryfast` | — (pending mapping) |
| `watch` | https://watch.accura.dev | — | — (pending mapping) |

Cron calls `ensureWatchedSites()` so config lands even without a manual seed.

## DevOps / preview

1. Import `silentdany/accura-watch` in Vercel (or link existing project).
2. Set env vars from `.env.example` (`CRON_SECRET`, `BETTER_AUTH_*`, `OWNER_EMAIL`, `DATABASE_URL`).
3. Deploy **main** — live domain `https://watch.accura.dev`.
4. Cron hits `/api/cron/collect` hourly (`vercel.json`); Vercel sends the `CRON_SECRET` Authorization header automatically when configured.
5. Run `npx prisma db push` once against Neon (adds `Site.config`), then `npm run db:seed` (or wait for cron).
6. Optional: set `SENTRY_AUTH_TOKEN` + `SENTRY_ORG=accura-9m` when Danny provides the token.
7. Optional: set `POSTHOG_API_KEY` + `POSTHOG_HOST`, then add `posthogProjectId` per site when Danny sends the mapping.

## Licence

Private · Accura.
