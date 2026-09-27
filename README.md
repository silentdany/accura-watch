# Accura Watch

**Open-source, MCP-native dashboard for all your sites.** See at a glance, for every site you run:

- **Google Search Console** (priority): clicks, impressions, CTR, average position with period-over-period deltas, top queries and pages, winners and losers
- **Domain SEO without an Ahrefs plan**: domain rank, backlinks, referring domains, organic keywords and estimated traffic via [DataForSEO](https://dataforseo.com) (pay-as-you-go, the same backend [OpenSEO](https://github.com/every-app/open-seo) uses), plus a free [Open PageRank](https://www.domcop.com/openpagerank/) score
- **Analytics** from **PostHog**: visitors, pageviews, top pages and referrers
- **Health**: uptime, latency, TLS certificate expiry
- **Sentry**: unresolved issues, error events per day and top issues

Sites are **not hardcoded**. Import them from Search Console in one click, or add any domain from the UI or through your AI agent. PostHog and Sentry projects are **auto-matched** by name.

Every metric and every action is exposed over **MCP** (and a mirrored REST API), so Claude, Cursor, ChatGPT and other clients can answer questions like *"which pages lost clicks this month, and are they throwing errors?"*

MIT licensed.

---

## Stack

Next.js 15 (App Router) · React 19 · Tailwind 4 · Prisma + Postgres · Better Auth · zod. No chart library (hand-rolled SVG) and no MCP SDK (a small spec-compliant JSON-RPC server).

## Quick start

```bash
git clone https://github.com/silentdany/accura-watch && cd accura-watch
cp .env.example .env        # set DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, CRON_SECRET
npm install
npx prisma db push
npm run dev
```

Open http://localhost:3000 and create the owner account. The first sign-up becomes the owner and sign-up closes after that; set `OWNER_EMAIL` to pin it to a specific address. Then:

1. **Settings → Google Search Console**: *Connect with Google* (needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) or paste a service-account JSON key.
2. **Sites → Import from Search Console**: tick the properties you want.
3. **Settings**: add PostHog (personal API key), Sentry (auth token + org), DataForSEO and/or Open PageRank. Click **Auto-match projects** on the Sites page.
4. **Settings → MCP & API**: create a token and connect your agent.

### Deploy on Vercel

1. Import the repo and set the env vars from `.env.example`.
2. Run `npx prisma db push` once against the production database.
3. `vercel.json` schedules `/api/cron/collect` hourly. The **Vercel Hobby** plan only allows daily crons, so either upgrade or enable `.github/workflows/collect.yml` (set the `WATCH_URL` and `CRON_SECRET` secrets and the `ENABLE_COLLECT_WORKFLOW=true` variable). Any external cron hitting the endpoint with `Authorization: Bearer $CRON_SECRET` also works.

## Data collection

`/api/cron/collect` is safe to call as often as you like. Each (site, source) pair has its own cadence, so APIs aren't hammered and DataForSEO isn't paid for twice:

| Source | Cadence | Backfill on first sync | Stored |
|---|---|---|---|
| Uptime | every run | — | status, latency, TLS expiry (90 days kept) |
| Sentry | ~1 h | 90 days | daily error events, unresolved count, top 10 issues |
| PostHog | ~2 h | 180 days | daily visitors/pageviews, 7/28/90-day uniques, top pages, referrers |
| Search Console | ~6 h | 16 months | daily clicks/impressions/position, top 50 queries & pages vs previous 28 days |
| Domain SEO | every *N* days (default 7) | — | rank, backlinks, referring domains, organic keywords/traffic, OPR |

**Sync now** buttons (global and per site) and the `sync_now` MCP tool bypass the cadence.

### Integrations

| Provider | Credentials | Notes |
|---|---|---|
| Google Search Console | OAuth (recommended) or service account | OAuth sees every property on your account. With a service account, add its email as a user on each property. |
| PostHog | Personal API key (`project:read`, `query:read`) + US/EU host | Uses HogQL. If one project tracks several sites, set the site's `$host` filter. |
| Sentry | Auth token (`org:read`, `project:read`, `event:read`) + org slug | `https://de.sentry.io` for EU, or your self-hosted URL. |
| DataForSEO | API login and password | Labs domain overview + Backlinks summary cost about $0.02–0.05 per site per refresh. The location/language codes set the market for keyword data. |
| Open PageRank | Free API key | 0–10 authority score. |

Credentials entered in Settings are stored **AES-256-GCM encrypted** (key derived from `ENCRYPTION_KEY` or `BETTER_AUTH_SECRET`). Every provider can also be configured through env vars (see `.env.example`); values from Settings take precedence.

## AI / MCP

Endpoint: `POST <your-url>/api/mcp`. This is the Streamable HTTP transport, stateless, returning JSON responses.

```bash
claude mcp add --transport http accura-watch https://watch.example.com/api/mcp \
  --header "Authorization: Bearer aw_xxx"
```

For clients that can't send headers, `…/api/mcp?key=aw_xxx` also works. Keep that URL private.

**Tools**

| Tool | What it does |
|---|---|
| `get_overview` | All sites' KPIs with deltas, portfolio totals and alerts. Start here. |
| `get_site_report` | Everything about one site: series, top queries/pages, referrers, issues, SEO. |
| `get_alerts` | Downtime, expiring TLS, traffic drops, error spikes, failing syncs. |
| `list_sites` | Sites with their provider mappings and sync status. |
| `query_search_console` | **Live** Search Analytics query: any dimensions, filters, dates. |
| `run_hogql` | **Live** read-only HogQL query on the site's PostHog project. |
| `list_sentry_issues` | **Live** Sentry issue search. |
| `get_domain_seo` | **Live** authority/backlinks/keywords for *any* domain, competitors included. |
| `check_site_health` | **Live** HTTP + TLS check. |
| `add_site` / `update_site` / `remove_site` | Manage sites (mappings are auto-detected). |
| `import_sites_from_gsc` / `list_gsc_properties` | Import from Search Console. |
| `auto_match_projects` | Map PostHog/Sentry projects to sites by name. |
| `sync_now` | Collect fresh data now. |
| `get_integrations` | Provider connection status (never returns secrets). |

**Prompts**: `weekly_review`, `seo_deep_dive`, `incident_triage`.

**REST**: `GET /api/v1` lists the tools with their JSON schemas. `POST /api/v1/tools/<name>` with a JSON body calls one. Both use the same Bearer token or a browser session. `/llms.txt` describes the instance for LLMs.

## Project layout

```
src/lib/providers/   API clients: google (GSC + OAuth), posthog, sentry, seo (DataForSEO, OPR), health
src/lib/collect/     collectors + scheduler (cadence, SyncState, backfill)
src/lib/metrics.ts   read model: overview, site report, alerts (shared by UI + MCP)
src/lib/sites.ts     site CRUD, GSC import, auto-matching
src/lib/mcp/         tool registry (zod → JSON Schema) + JSON-RPC MCP server
src/app/(app)/       dashboard, site detail, sites, settings
src/app/api/         auth, cron, mcp, v1 (REST), Google OAuth
```

## Contributing

PRs welcome. Run `npm run typecheck && npm run lint && npm run build` before opening one. To add a data source:

1. Write a provider in `src/lib/providers/`.
2. Add a collector in `src/lib/collect/collectors.ts`.
3. Surface it in `src/lib/metrics.ts`.
4. Expose any live queries as tools in `src/lib/mcp/tools.ts`.

See `AGENTS.md` for conventions (AI coding agents read it too).

## License

MIT
