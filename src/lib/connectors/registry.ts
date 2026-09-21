import { healthConnector } from "./health";
import type { Connector, ConnectorId } from "./types";

/**
 * Connector registry — health is live stub; others are placeholders for V1.
 */
const stubs: Connector[] = (
  [
    ["sentry", "Sentry"],
    ["posthog", "PostHog"],
    ["gsc", "GSC"],
    ["ahrefs", "Ahrefs DR"],
  ] as const
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

export const connectors: Connector[] = [healthConnector, ...stubs];

export function getConnector(id: ConnectorId): Connector | undefined {
  return connectors.find((c) => c.id === id);
}

export function listConnectors(): { id: ConnectorId; label: string }[] {
  return connectors.map(({ id, label }) => ({ id, label }));
}
