import { appUrl } from "@/lib/env";
import { TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

/** Machine-readable description of this instance for LLMs / agents. */
export function GET() {
  const base = appUrl();
  const body = `# Accura Watch

> Open-source, MCP-native dashboard for a portfolio of websites: Google Search Console, PostHog, Sentry, uptime/TLS and domain SEO (DataForSEO, Open PageRank).

## Connect an agent

- MCP (Streamable HTTP): ${base}/api/mcp — OAuth 2.1 (authorization code + PKCE). Paste that URL into the client; it opens a consent page. A bearer token from Settings still works for scripts.
- Claude Code: \`claude mcp add --transport http accura-watch ${base}/api/mcp\`
- REST: GET ${base}/api/v1 lists tools; POST ${base}/api/v1/tools/<name> with a JSON body calls one (API token or browser session, not an OAuth access token).

## Tools

${TOOLS.map((t) => `- \`${t.name}\`: ${t.description}`).join("\n")}

## Source

- https://github.com/silentdany/accura-watch (MIT)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
