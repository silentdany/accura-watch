# AGENTS.md

Guidance for AI coding agents (and humans) working on this repo.

## Principles

- **MCP-native**: every capability of the UI must also exist as a tool in `src/lib/mcp/tools.ts`. The UI and the MCP server share the same services (`lib/sites.ts`, `lib/metrics.ts`, `lib/collect`). Never put business logic in a page or route.
- **Nothing hardcoded**: sites, mappings and credentials live in the database. Env vars are only a fallback.
- **Graceful degradation**: a missing provider means the collector is *skipped*, not errored. The UI shows "—" with a hint.
- **Secrets**: provider secrets are encrypted with `lib/crypto.ts` and never returned by tools or rendered in the UI.

## Commands

```bash
npm run typecheck
npm run lint
npm run build         # needs DATABASE_URL set (any value) at build time
npx prisma db push    # sync schema to the database
```

## Conventions

- Server actions live in `src/app/actions.ts`, are guarded by a session check, and return `ActionState`.
- Tool inputs are zod schemas converted with `z.toJSONSchema`. Tool errors are returned in-band (`isError: true`).
- Charts are hand-rolled SVG (`components/chart.tsx`, `components/sparkline.tsx`). Keep one color per source (`--c-gsc`, `--c-posthog`, `--c-sentry`, `--c-health`, `--c-seo`) and never use a dual y-axis.
- Daily metrics use the `DailyMetric` table (`siteId, source, key, date`); rich payloads use `Insight` (`siteId, source, kind`).
