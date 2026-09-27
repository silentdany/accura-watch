import { callTool, TOOLS, toolJsonSchema } from "./tools";
import { errorMessage } from "@/lib/http";

/**
 * Minimal, dependency-free MCP server (Streamable HTTP transport, stateless,
 * JSON responses). Implements initialize, ping, tools/*, prompts/*.
 * Spec: https://modelcontextprotocol.io/specification
 */

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "accura-watch", title: "Accura Watch", version: "0.2.0" };

const INSTRUCTIONS = `Accura Watch monitors a portfolio of websites: Google Search Console (priority), PostHog analytics, Sentry errors, uptime/TLS and domain SEO (DataForSEO / Open PageRank).
Start with get_overview (or get_alerts) for the big picture, then get_site_report for one site and get_site_insights for cross-source stats (search share, errors per visitor, correlations, CTR gaps).
For ad-hoc questions use the live tools: query_search_console, run_hogql, list_sentry_issues, get_domain_seo, check_site_health.
Sites are referenced by slug or domain. Stored metrics are refreshed by a cron; call sync_now if data looks stale.`;

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
type JsonRpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const PROMPTS = [
  {
    name: "weekly_review",
    title: "Weekly portfolio review",
    description: "Review the last 7 days across all sites: SEO, traffic, errors, uptime — with prioritized actions.",
    arguments: [],
    text: "Use get_overview with range 7, then get_alerts. For each site with a notable change (±20% clicks or visitors, new Sentry spike, downtime), call get_site_report and dig into top queries/pages. Write a concise weekly review: portfolio headline numbers, winners, losers, incidents, and a prioritized list of 3–5 actions.",
  },
  {
    name: "seo_deep_dive",
    title: "SEO deep dive",
    description: "Analyze one site's Search Console performance and find quick wins.",
    arguments: [{ name: "site", description: "Site slug or domain", required: true }],
    text: "For site {{site}}: call get_site_report (range 28) and get_site_insights (CTR gaps, striking distance, per-page search share), then query_search_console for queries ranking in positions 5–20 with high impressions (dimensions query,page; row_limit 500). Identify quick wins (striking-distance keywords, low-CTR pages with good position, cannibalization) and declining pages vs previous period. Finish with get_domain_seo for authority context. Output a prioritized action list.",
  },
  {
    name: "incident_triage",
    title: "Incident triage",
    description: "Triage current downtime and error spikes.",
    arguments: [],
    text: "Call get_alerts (range 7). For every critical/warning alert: run check_site_health for health alerts, list_sentry_issues (sort freq, stats_period 24h) for Sentry alerts. Summarize root-cause hypotheses and next steps per incident.",
  },
];

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function fail(id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return fail(msg?.id ?? null, -32600, "Invalid Request");
  }
  const isNotification = msg.id === undefined || msg.id === null;
  const p = msg.params ?? {};

  switch (msg.method) {
    case "initialize": {
      const requested = String(p.protocolVersion ?? "");
      return ok(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: toolJsonSchema(t),
          ...(t.annotations ? { annotations: { title: t.title, ...t.annotations } } : {}),
        })),
      });
    case "tools/call": {
      const name = String(p.name ?? "");
      try {
        const result = await callTool(name, p.arguments ?? {});
        const text = JSON.stringify(result, null, 2);
        const structured = result && typeof result === "object" && !Array.isArray(result) ? result : { result };
        return ok(msg.id, { content: [{ type: "text", text }], structuredContent: structured, isError: false });
      } catch (err) {
        // Tool errors are reported in-band so the model can recover.
        return ok(msg.id, { content: [{ type: "text", text: errorMessage(err) }], isError: true });
      }
    }
    case "prompts/list":
      return ok(msg.id, {
        prompts: PROMPTS.map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args })),
      });
    case "prompts/get": {
      const prompt = PROMPTS.find((x) => x.name === p.name);
      if (!prompt) return fail(msg.id, -32602, `Unknown prompt: ${String(p.name)}`);
      const args = (p.arguments ?? {}) as Record<string, string>;
      const text = prompt.text.replace(/\{\{(\w+)\}\}/g, (_, k) => args[k] ?? `<${k}>`);
      return ok(msg.id, { description: prompt.description, messages: [{ role: "user", content: { type: "text", text } }] });
    }
    case "resources/list":
      return ok(msg.id, { resources: [] });
    case "resources/templates/list":
      return ok(msg.id, { resourceTemplates: [] });
    default:
      if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** Handle a JSON-RPC payload (single message or batch). Returns null when only notifications were sent. */
export async function handleMcpPayload(payload: unknown): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(payload)) {
    const out = (await Promise.all(payload.map((m) => handle(m as JsonRpcRequest)))).filter(
      (r): r is JsonRpcResponse => r !== null,
    );
    return out.length ? out : null;
  }
  return handle(payload as JsonRpcRequest);
}
