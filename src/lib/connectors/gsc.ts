import { createSign } from "node:crypto";
import type { Connector, ConnectorResult } from "./types";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 12_000;

function utcDateYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function last7DaysRangeUtc(): { startDate: string; endDate: string } {
  const end = new Date();
  // GSC data often lags 2-3 days; end at yesterday UTC for safer queries.
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { startDate: utcDateYmd(start), endDate: utcDateYmd(end) };
}

function skipped(
  key: string,
  reason: string,
  extra?: Record<string, unknown>,
): ConnectorResult {
  return {
    source: "gsc",
    key,
    valueText: "skipped",
    ok: true,
    meta: { configured: false, skipped: true, reason, ...extra },
  };
}

function errorResults(
  message: string,
  meta: Record<string, unknown>,
): ConnectorResult[] {
  const keys = ["clicks7d", "impressions7d", "ctr", "position"] as const;
  return keys.map((key) => ({
    source: "gsc" as const,
    key,
    valueText: "error",
    ok: false,
    error: message,
    meta: { configured: true, error: message, ...meta },
  }));
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Minimal RS256 JWT for Google service-account token exchange (no extra deps).
 */
function signServiceAccountJwt(
  clientEmail: string,
  privateKeyPem: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: GSC_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  // Vercel / .env often store newlines as \n literals
  const key = privateKeyPem.includes("\\n")
    ? privateKeyPem.replace(/\\n/g, "\n")
    : privateKeyPem;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const sig = signer.sign(key);
  return `${unsigned}.${base64url(sig)}`;
}

async function getAccessToken(
  clientEmail: string,
  privateKey: string,
): Promise<string> {
  const assertion = signServiceAccountJwt(clientEmail, privateKey);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`GSC token ${res.status}: ${text.slice(0, 180)}`);
  }
  let json: { access_token?: string };
  try {
    json = JSON.parse(text) as { access_token?: string };
  } catch {
    throw new Error("GSC token response is not JSON");
  }
  if (!json.access_token) {
    throw new Error("GSC token missing access_token");
  }
  return json.access_token;
}

type SearchAnalyticsRow = {
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

/**
 * Google Search Console connector — per-site property via Site.config.gscSiteUrl.
 * Env (global): GSC_CLIENT_EMAIL + GSC_PRIVATE_KEY (service account).
 * Absent site config OR absent secrets → skipped (ok:true). OAuth out of scope for V1.
 */
export const gscConnector: Connector = {
  id: "gsc",
  label: "GSC",
  async collect(ctx) {
    const property = ctx.siteConfig?.gscSiteUrl ?? null;
    const clientEmail = process.env.GSC_CLIENT_EMAIL?.trim() || null;
    const privateKey = process.env.GSC_PRIVATE_KEY?.trim() || null;

    if (!property) {
      return [
        skipped("clicks7d", "no gscSiteUrl"),
        skipped("impressions7d", "no gscSiteUrl"),
        skipped("ctr", "no gscSiteUrl"),
        skipped("position", "no gscSiteUrl"),
      ];
    }

    if (!clientEmail || !privateKey) {
      const reason = !clientEmail
        ? "missing GSC_CLIENT_EMAIL"
        : "missing GSC_PRIVATE_KEY";
      return [
        skipped("clicks7d", reason, { property }),
        skipped("impressions7d", reason, { property }),
        skipped("ctr", reason, { property }),
        skipped("position", reason, { property }),
      ];
    }

    const { startDate, endDate } = last7DaysRangeUtc();

    try {
      const accessToken = await getAccessToken(clientEmail, privateKey);
      const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: [],
          aggregationType: "auto",
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return errorResults(`GSC API ${res.status}`, {
          property,
          status: res.status,
          bodyPreview: text.slice(0, 200),
          startDate,
          endDate,
        });
      }

      let payload: { rows?: SearchAnalyticsRow[] };
      try {
        payload = JSON.parse(text) as { rows?: SearchAnalyticsRow[] };
      } catch {
        return errorResults("GSC response is not JSON", {
          property,
          bodyPreview: text.slice(0, 200),
        });
      }

      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      let clicks = 0;
      let impressions = 0;
      let ctrSum = 0;
      let posSum = 0;
      let weightedImpressions = 0;

      for (const row of rows) {
        const c = typeof row.clicks === "number" ? row.clicks : 0;
        const im =
          typeof row.impressions === "number" ? row.impressions : 0;
        clicks += c;
        impressions += im;
        if (typeof row.ctr === "number") ctrSum += row.ctr * im;
        if (typeof row.position === "number") posSum += row.position * im;
        weightedImpressions += im;
      }

      // Empty rows = valid zero window (property OK, no traffic).
      const ctr =
        weightedImpressions > 0
          ? ctrSum / weightedImpressions
          : rows[0]?.ctr ?? 0;
      const position =
        weightedImpressions > 0
          ? posSum / weightedImpressions
          : rows[0]?.position ?? 0;

      const meta = {
        configured: true,
        property,
        startDate,
        endDate,
        rowCount: rows.length,
      };

      return [
        {
          source: "gsc",
          key: "clicks7d",
          value: clicks,
          valueText: String(clicks),
          ok: true,
          meta,
        },
        {
          source: "gsc",
          key: "impressions7d",
          value: impressions,
          valueText: String(impressions),
          ok: true,
          meta,
        },
        {
          source: "gsc",
          key: "ctr",
          value: Number.isFinite(ctr) ? ctr : 0,
          valueText: String(Number.isFinite(ctr) ? ctr : 0),
          ok: true,
          meta,
        },
        {
          source: "gsc",
          key: "position",
          value: Number.isFinite(position) ? position : 0,
          valueText: String(Number.isFinite(position) ? position : 0),
          ok: true,
          meta,
        },
      ] satisfies ConnectorResult[];
    } catch (err) {
      const message = err instanceof Error ? err.message : "GSC fetch failed";
      return errorResults(message, { property, startDate, endDate });
    }
  },
};
