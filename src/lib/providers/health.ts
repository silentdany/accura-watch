import { connect } from "node:tls";

export type HealthResult = {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  sslExpiresAt: Date | null;
  finalUrl: string | null;
  error: string | null;
};

function certExpiry(host: string): Promise<Date | null> {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, timeout: 8_000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert?.valid_to ? new Date(cert.valid_to) : null);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

/** GET the site (following redirects), time it, and read the TLS certificate expiry. */
export async function checkHealth(url: string): Promise<HealthResult> {
  let host: string | null = null;
  try {
    const u = new URL(url);
    if (u.protocol === "https:") host = u.hostname;
  } catch {
    return { ok: false, statusCode: null, latencyMs: null, sslExpiresAt: null, finalUrl: null, error: "Invalid URL" };
  }

  const sslPromise = host ? certExpiry(host) : Promise.resolve(null);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
      headers: { "User-Agent": "AccuraWatch/1.0 (+uptime check)" },
    });
    const latencyMs = Date.now() - started;
    await res.body?.cancel().catch(() => {});
    const sslExpiresAt = await sslPromise;
    // 401/403/429 usually mean bot protection or auth walls: the server is up.
    const ok = res.status < 400 || [401, 403, 429].includes(res.status);
    return {
      ok,
      statusCode: res.status,
      latencyMs,
      sslExpiresAt,
      finalUrl: res.url || url,
      error: ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    const sslExpiresAt = await sslPromise;
    const cause = err instanceof Error ? ((err.cause as Error | undefined)?.message ?? err.message) : String(err);
    return { ok: false, statusCode: null, latencyMs: null, sslExpiresAt, finalUrl: null, error: cause };
  }
}
