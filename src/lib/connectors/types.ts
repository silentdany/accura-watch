import type { SiteConfig } from "@/lib/site-config";

export type ConnectorId =
  | "health"
  | "sentry"
  | "posthog"
  | "gsc"
  | "ahrefs";

export type ConnectorResult = {
  source: ConnectorId;
  key: string;
  value?: number;
  valueText?: string;
  meta?: Record<string, unknown>;
  ok: boolean;
  error?: string;
};

export type ConnectorContext = {
  siteId: string;
  siteUrl: string;
  siteName: string;
  siteConfig?: SiteConfig;
};

export type Connector = {
  id: ConnectorId;
  label: string;
  collect: (ctx: ConnectorContext) => Promise<ConnectorResult[]>;
};
