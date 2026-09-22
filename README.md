# Accura Watch

**Accura Watch** — monitoring dashboard for Accura sites (`watch.accura.dev`).

Danny solo · V1 · Console graphite UI · Better Auth + Prisma wire.

---

## Stack

- **Next.js** App Router (TypeScript) + **React 19** + **Tailwind CSS 4**
- **Prisma** (`User`/`Session`/`Account`/`Verification` + `Site`/`MetricSnapshot`) → Postgres / Neon
- **Better Auth** email/password (`src/lib/auth.ts`) — solo `OWNER_EMAIL`
- Connectors: **health** + **Sentry** + **GSC** + **Ahrefs DR** (free) + PostHog placeholder
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
| `GSC_CLIENT_EMAIL` | Optional — Google SA client email for Search Console |
| `GSC_PRIVATE_KEY` | Optional — Google SA PEM private key (`\n` escaped OK) |
| `AHREFS_API_KEY` | Optional — free Ahrefs APIv3 key for Domain Rating |

See `.env.example`. Connectors **skip** (ok) when secrets or per-site config are absent — cron stays green without them.

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
- `gsc` — Search Analytics last 7d (`clicks7d`, `impressions7d`, `ctr`, `position`) via `Site.config.gscSiteUrl` + `GSC_CLIENT_EMAIL` / `GSC_PRIVATE_KEY`. Missing config **or** secrets → skipped. Dashboard KPI = sum of latest `clicks7d` (hint may mention impressions).
- `ahrefs` — free Domain Rating (`dr`) from `GET /v3/public/domain-rating-free`; target = hostname of `Site.url`. Needs `AHREFS_API_KEY`. No key → skipped. Dashboard KPI = average DR across sites with a numeric snapshot. Attribution: Domain Rating by Ahrefs.
- `posthog` — stub returning `not configured` (real connector lands via PR #7 — HOLD)

Soft Design UI redesign is backlog (no UI redesign on this scaffold).

## Watched sites (seed)

| Slug | URL | Sentry project |
|------|-----|----------------|
| `accura` | https://accura.dev | — |
| `brieform` | https://brieform.app | `brieform` |
| `directoryfast` | https://directoryfa.st | `directoryfast` |
| `watch` | https://watch.accura.dev | — |

Cron calls `ensureWatchedSites()` so config lands even without a manual seed. GSC/Ahrefs site mapping is **not** invented in seed — set `Site.config.gscSiteUrl` when Danny provides property URLs; Ahrefs needs no config id.

## DevOps / preview

1. Import `silentdany/accura-watch` in Vercel (or link existing project).
2. Set env vars from `.env.example` (`CRON_SECRET`, `BETTER_AUTH_*`, `OWNER_EMAIL`, `DATABASE_URL`).
3. Deploy **main** — live domain `https://watch.accura.dev`.
4. Cron hits `/api/cron/collect` hourly (`vercel.json`); Vercel sends the `CRON_SECRET` Authorization header automatically when configured.
5. Run `npx prisma db push` once against Neon (adds `Site.config`), then `npm run db:seed` (or wait for cron).
6. Optional: set `SENTRY_AUTH_TOKEN` + `SENTRY_ORG=accura-9m` when Danny provides the token.
7. Optional smoke: set `GSC_CLIENT_EMAIL` + `GSC_PRIVATE_KEY` + per-site `gscSiteUrl`, and/or `AHREFS_API_KEY`.

## Licence

Private · Accura.
