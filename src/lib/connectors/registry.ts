import { ahrefsConnector } from "./ahrefs";
import { gscConnector } from "./gsc";
import { healthConnector } from "./health";
import { sentryConnector } from "./sentry";
import type { Connector, ConnectorId } from "./types";

/**
 * Connector registry — health + Sentry + GSC + Ahrefs live;
 * PostHog remains a stub until PR #7 (feat/posthog-per-site) merges.
 */
const stubs: Connector[] = (
  [["posthog", "PostHog"]] as const
).map(([id, label]) => ({
  id: id as ConnectorId,
  label,
  async collect() {
    return [
      {
        source: id as ConnectorId,
        key: "stub",
        valueText: "not configured",
        ok: true,
        meta: { stub: true },
      },
    ];
  },
}));

export const connectors: Connector[] = [
  healthConnector,
  sentryConnector,
  ...stubs,
  gscConnector,
  ahrefsConnector,
];

export function getConnector(id: ConnectorId): Connector | undefined {
  return connectors.find((c) => c.id === id);
}

export function listConnectors(): { id: ConnectorId; label: string }[] {
  return connectors.map(({ id, label }) => ({ id, label }));
}
