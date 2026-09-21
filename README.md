# Accura Watch

**Accura Watch** — monitoring dashboard for Accura sites (`watch.accura.dev`).

Danny solo · V1 · Console graphite UI · Better Auth + Prisma wire.

---

## Stack

- **Next.js** App Router (TypeScript) + **React 19** + **Tailwind CSS 4**
- **Prisma** (`User`/`Session`/`Account`/`Verification` + `Site`/`MetricSnapshot`) → Postgres / Neon
- **Better Auth** email/password (`src/lib/auth.ts`) — solo `OWNER_EMAIL`
- Connectors: **health** + **Sentry** + PostHog / GSC / Ahrefs placeholders
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
| `BETTER_AUTH_URL` | Public app URL (`https://accura-watch.vercel.app` in prod) |
| `OWNER_EMAIL` | Solo allowed email (default `dany@accura.dev`) |
| `NEXT_PUBLIC_APP_URL` | Public origin |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | Optional Sentry connector |

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
- `sentry` — unresolved issues count (or `not configured`)
- `posthog` / `gsc` / `ahrefs` — stubs returning `not configured`

## DevOps / preview

1. Import `silentdany/accura-watch` in Vercel (or link existing project).
2. Set env vars from `.env.example` (`CRON_SECRET`, `BETTER_AUTH_*`, `OWNER_EMAIL`, `DATABASE_URL`).
3. Deploy **main** — preview URLs work on any branch.
4. Cron hits `/api/cron/collect` hourly (`vercel.json`); Vercel sends the `CRON_SECRET` Authorization header automatically when configured.
5. Run `npx prisma db push` once against Neon, then `npm run db:seed`.

## Licence

Private · Accura.
