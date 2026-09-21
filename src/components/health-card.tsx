import { Card, CardTitle } from "@/components/ui/card";
import type { HealthMetrics } from "@/lib/connectors/types";
import { cn } from "@/lib/utils";

const statusLabel: Record<HealthMetrics["status"], string> = {
  up: "Up",
  down: "Down",
  degraded: "Degraded",
  unknown: "Unknown",
};

const statusColor: Record<HealthMetrics["status"], string> = {
  up: "text-ok",
  down: "text-bad",
  degraded: "text-warn",
  unknown: "text-muted",
};

export function HealthCard({
  siteName,
  siteUrl,
  health,
}: {
  siteName: string;
  siteUrl: string;
  health: HealthMetrics;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>Health</CardTitle>
          <p className="mt-1 text-lg font-semibold text-foreground">{siteName}</p>
          <a
            href={siteUrl}
            className="mt-0.5 block text-xs text-muted hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            {siteUrl.replace(/^https?:\/\//, "")}
          </a>
        </div>
        <span
          className={cn(
            "rounded-md border border-border px-2 py-1 text-xs font-medium",
            statusColor[health.status],
          )}
        >
          {statusLabel[health.status]}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted">Latency</dt>
          <dd className="font-mono tabular-nums">
            {health.latencyMs != null ? `${health.latencyMs} ms` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Status</dt>
          <dd className="font-mono tabular-nums">
            {health.statusCode ?? "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] text-muted">
        Checked {new Date(health.checkedAt).toLocaleString("fr-FR")}
        {health.detail ? ` · ${health.detail}` : ""}
      </p>
    </Card>
  );
}
