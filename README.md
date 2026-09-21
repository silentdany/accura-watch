# Accura Watch

**Accura Watch** — monitoring dashboard for Accura sites (`watch.accura.dev`).

Danny solo · V1 scaffold · Console graphite UI.

---

## Stack

- **Next.js** App Router (TypeScript) + **React 19** + **Tailwind CSS 4**
- **Prisma** (`Site`, `MetricSnapshot`) → Postgres / Neon
- **Better Auth** stub (`src/lib/auth.ts`) — wire later
- Connectors: **health** (live stub) + Sentry / PostHog / GSC / Ahrefs placeholders
- Cron: `GET /api/cron/collect` guarded by `CRON_SECRET`
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
# Fill DATABASE_URL, CRON_SECRET, BETTER_AUTH_*

npm install
npx prisma db push   # optional until DB is ready
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
| `BETTER_AUTH_SECRET` | Auth secret (≥32 chars) — stub |
| `BETTER_AUTH_URL` | Public app URL |
| `NEXT_PUBLIC_APP_URL` | Used by health connector mock site |

See `.env.example`.

## Routes

| Path | Description |
|------|-------------|
| `/` | Shell + 5 mock KPI cards (Health, Sentry, PostHog, GSC, Ahrefs DR) |
| `/login` | Auth placeholder |
| `/api/cron/collect` | Collect all connectors (`Authorization: Bearer $CRON_SECRET`) |

## Connectors

Registry: `src/lib/connectors/registry.ts`

- `health` — HEAD site URL, latency + up/down
- `sentry` / `posthog` / `gsc` / `ahrefs` — stubs returning `not configured`

## DevOps / preview

1. Import `silentdany/accura-watch` in Vercel (or link existing project).
2. Set env vars from `.env.example` (`CRON_SECRET` required for cron).
3. Deploy **main** — preview URLs work on any branch.
4. Cron hits `/api/cron/collect` hourly (`vercel.json`); Vercel sends the `CRON_SECRET` Authorization header automatically when configured.

## Licence

Private · Accura.
