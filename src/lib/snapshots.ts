import type { MetricSnapshot } from "@/lib/connectors/types";

/**
 * In-memory snapshot store (dev / single-instance stub).
 * Production: Postgres / KV — Architect + DevOps.
 */
const store = new Map<string, MetricSnapshot>();

export function saveSnapshot(snapshot: MetricSnapshot): void {
  store.set(snapshot.siteId, snapshot);
}

export function getSnapshot(siteId: string): MetricSnapshot | undefined {
  return store.get(siteId);
}

export function listSnapshots(): MetricSnapshot[] {
  return Array.from(store.values());
}
