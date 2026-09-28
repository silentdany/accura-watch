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
npm run db:sync       # schema sync (what vercel-build runs); migrates the v0.1 schema
npx prisma db push    # sync schema to the database
```

## Conventions

- Server actions live in `src/app/actions.ts`, are guarded by a session check, and return `ActionState`.
- Tool inputs are zod schemas converted with `z.toJSONSchema`. Tool errors are returned in-band (`isError: true`).
- UI text lives in `src/i18n/fr.ts` (reference) and `src/i18n/en.ts` (same shape, type-checked). Server components use `getI18n()`, client components `useI18n()`; both return `t` (messages) and `f` (locale-aware number/date formatting). Write for non-experts: plain words, and every metric gets a `help` explanation shown behind a "?".
- Theme: light by default, dark via `prefers-color-scheme` or the `aw_theme` cookie (`data-theme` on `<html>`). Colors are tokens in `globals.css`; status colors (`good`, `warning`, `destructive`, `info`) always come with an icon or a word.
- Charts are hand-rolled SVG (`components/chart.tsx`, `components/sparkline.tsx`). Keep one color per source (`--c-gsc`, `--c-posthog`, `--c-sentry`, `--c-health`, `--c-seo`); a second series in the same chart is a neutral dashed companion (`--c-companion`, `dashed: true`), never a second hue, and never use a dual y-axis: to overlay two measures of different scale, use `TimeSeriesChart indexed` (each series as % of its own average, raw values in the tooltip).
- Cross-source stats (ratios, correlations, joins between providers) live in `lib/insights.ts`, exposed as `get_site_insights`.
- Daily metrics use the `DailyMetric` table (`siteId, source, key, date`); rich payloads use `Insight` (`siteId, source, kind`).
