# Accura Watch

Monitoring dashboard for Accura sites — **watch.accura.dev**.

Solo: Danny. Stack: Next.js, TypeScript, Tailwind, shadcn-style UI, Vercel.

## V1 scope

- **Health** card (first metric surface)
- Stubs: `fetchMetrics(siteId)`, snapshots, cron
- Auth: Better Auth scaffold — **Architect decides** final (Better Auth vs simple session)

## Dev

```bash
pnpm install   # or npm / yarn
cp .env.example .env.local
pnpm dev
```

## Architecture (planned)

```
connectors/  → fetchMetrics(siteId) → MetricSnapshot
snapshots/   → store last N reads (stub in-memory for now)
cron/        → Vercel Cron hits /api/cron → refresh all sites
ui/          → cards (Health first)
```

No military / regiment data. Public Accura product tooling only.
