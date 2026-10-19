import { lookup } from "node:dns/promises";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import {
  MCP_SCOPE,
  canonicalResource,
  isLoopback,
  isPrivateAddress,
  pkceS256,
  redirectMatches,
  validCodeChallenge,
  validCodeVerifier,
  validateRedirectUri,
} from "./checks";

export const OAUTH_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

const ACCESS_TTL_S = 60 * 60;
const REFRESH_TTL_S = 60 * 60 * 24 * 60;
const CODE_TTL_S = 5 * 60;
const ACCESS_PREFIX = "awoa";
const REFRESH_PREFIX = "awor";

export function issuer(): string {
  return appUrl();
}

/** Canonical URI of the MCP resource server. Tokens are bound to this audience. */
export function mcpResource(): string {
  const raw = `${issuer()}/api/mcp`;
  return canonicalResource(raw) ?? raw;
}

export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [MCP_SCOPE],
    client_id_metadata_document_supported: true,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Accura Watch",
  };
}

/** `WWW-Authenticate` challenge that points MCP clients at the protected-resource metadata. */
export function wwwAuthenticate(invalid: boolean): string {
  const metadata = `${issuer()}/.well-known/oauth-protected-resource/api/mcp`;
  const base = `Bearer realm="accura-watch", resource_metadata="${metadata}", scope="${MCP_SCOPE}"`;
  return invalid ? `${base}, error="invalid_token"` : base;
}

export type OauthFailure = { error: string; description: string; status: number };

async function readLimited(res: Response, max: number): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function fail(error: string, description: string, status = 400): OauthFailure {
  return { error, description, status };
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f]/g, "").trim();
  if (!name || name.length > 120) return null;
  return name;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return null;
  if (!value.every((v) => typeof v === "string")) return null;
  return value as string[];
}

/** Dynamic client registration. Public clients only: no secret, PKCE at authorize time. */
export async function registerClient(body: unknown): Promise<{ client_id: string; body: Record<string, unknown> } | OauthFailure> {
  if (!body || typeof body !== "object") return fail("invalid_client_metadata", "Expected a JSON object.");
  const raw = body as Record<string, unknown>;
  const name = cleanName(raw.client_name) ?? "MCP client";
  const redirects = stringList(raw.redirect_uris);
  if (!redirects || redirects.some((uri) => !validateRedirectUri(uri))) {
    return fail("invalid_redirect_uri", "redirect_uris must be https, loopback http, or an app scheme.");
  }
  const method = raw.token_endpoint_auth_method;
  if (method != null && method !== "none") return fail("invalid_client_metadata", "Only public clients (token_endpoint_auth_method=none) are accepted.");
  const grants = raw.grant_types == null ? ["authorization_code", "refresh_token"] : stringList(raw.grant_types);
  if (!grants || grants.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return fail("invalid_client_metadata", "grant_types must be authorization_code and refresh_token.");
  }
  const responses = raw.response_types == null ? ["code"] : stringList(raw.response_types);
  if (!responses || responses.some((r) => r !== "code")) return fail("invalid_client_metadata", "response_types must be code.");
  const clientUri = typeof raw.client_uri === "string" && validateRedirectUri(raw.client_uri) && raw.client_uri.startsWith("https://") ? raw.client_uri : null;

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.oauthClient.count({ where: { kind: "dcr", createdAt: { gte: since } } });
  if (recent >= 60) return fail("too_many_requests", "Too many clients registered this hour.", 429);

  const clientId = randomToken("awoc");
  await prisma.oauthClient.create({
    data: {
      id: clientId,
      name,
      redirectUris: redirects,
      grantTypes: grants,
      responseTypes: responses,
      tokenEndpointAuthMethod: "none",
      scope: MCP_SCOPE,
      clientUri,
      kind: "dcr",
    },
  });
  return {
    client_id: clientId,
    body: {
      client_id: clientId,
      client_name: name,
      client_uri: clientUri ?? undefined,
      redirect_uris: redirects,
      grant_types: grants,
      response_types: responses,
      token_endpoint_auth_method: "none",
      scope: MCP_SCOPE,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
  };
}

type ClientRow = {
  id: string;
  name: string;
  redirectUris: string[];
  clientUri: string | null;
};

async function fetchCimd(clientId: string): Promise<ClientRow | OauthFailure> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return fail("invalid_client", "Unknown client.", 401);
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.pathname === "/") {
    return fail("invalid_client", "Client ID metadata URL must be https with a path.", 401);
  }
  if (isLoopback(host) || isPrivateAddress(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    return fail("invalid_client", "Client ID metadata host is not public.", 401);
  }
  try {
    const records = await lookup(url.hostname, { all: true });
    if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
      return fail("invalid_client", "Client ID metadata host is not public.", 401);
    }
  } catch {
    return fail("invalid_client", "Client ID metadata host did not resolve.", 401);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: "application/json" },
    });
  } catch {
    return fail("invalid_client", "Could not fetch client metadata.", 401);
  }
  if (res.status !== 200) return fail("invalid_client", "Client metadata was not available.", 401);
  const text = await readLimited(res, 64_000);
  if (text == null) return fail("invalid_client", "Client metadata is too large.", 401);
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return fail("invalid_client", "Client metadata is not JSON.", 401);
  }
  if (doc.client_id !== clientId) return fail("invalid_client", "client_id in the metadata document does not match the URL.", 401);
  const name = cleanName(doc.client_name);
  const redirects = stringList(doc.redirect_uris);
  if (!name || !redirects || redirects.some((uri) => !validateRedirectUri(uri))) {
    return fail("invalid_client", "Client metadata is missing a name or valid redirect URIs.", 401);
  }
  const clientUri = typeof doc.client_uri === "string" && doc.client_uri.startsWith("https://") ? doc.client_uri : null;
  await prisma.oauthClient.upsert({
    where: { id: clientId },
    create: {
      id: clientId,
      name,
      redirectUris: redirects,
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      scope: MCP_SCOPE,
      clientUri,
      kind: "cimd",
    },
    update: { name, redirectUris: redirects, clientUri },
  });
  return { id: clientId, name, redirectUris: redirects, clientUri };
}

export async function resolveClient(clientId: string, opts?: { refreshCimd?: boolean }): Promise<ClientRow | OauthFailure> {
  if (!clientId || clientId.length > 500) return fail("invalid_client", "Unknown client.", 401);
  if (opts?.refreshCimd && clientId.startsWith("https://")) return fetchCimd(clientId);
  const row = await prisma.oauthClient.findUnique({ where: { id: clientId } });
  if (row) return { id: row.id, name: row.name, redirectUris: row.redirectUris, clientUri: row.clientUri };
  if (clientId.startsWith("https://")) return fetchCimd(clientId);
  return fail("invalid_client", "Unknown client.", 401);
}

export type AuthorizeInput = {
  responseType: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string;
  scope: string;
  state: string;
};

export function readAuthorizeFields(get: (key: string) => string | null): AuthorizeInput {
  return {
    responseType: get("response_type") ?? "",
    clientId: get("client_id") ?? "",
    redirectUri: get("redirect_uri") ?? "",
    codeChallenge: get("code_challenge") ?? "",
    codeChallengeMethod: get("code_challenge_method") ?? "",
    resource: get("resource") ?? "",
    scope: get("scope") ?? "",
    state: get("state") ?? "",
  };
}

export type AuthorizeCheck =
  | { ok: true; client: ClientRow; input: AuthorizeInput; resource: string; scope: string }
  | { ok: false; message: string; redirect?: string };

function errorRedirect(redirectUri: string, error: string, description: string, state: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  url.searchParams.set("iss", issuer());
  return url.toString();
}

/** Validate an authorization request. Redirects only after the redirect URI is known to belong to the client. */
export async function checkAuthorize(input: AuthorizeInput): Promise<AuthorizeCheck> {
  const client = await resolveClient(input.clientId, { refreshCimd: true });
  if ("error" in client) return { ok: false, message: client.description };
  if (!validateRedirectUri(input.redirectUri) || !client.redirectUris.some((uri) => redirectMatches(uri, input.redirectUri))) {
    return { ok: false, message: "This redirect address is not registered for the application." };
  }
  const bounce = (error: string, description: string) => ({ ok: false as const, message: description, redirect: errorRedirect(input.redirectUri, error, description, input.state) });
  if (!input.state || input.state.length > 512 || /[\u0000-\u001f]/.test(input.state)) return bounce("invalid_request", "state is missing.");
  if (input.responseType !== "code") return bounce("unsupported_response_type", "response_type must be code.");
  if (input.codeChallengeMethod !== "S256" || !validCodeChallenge(input.codeChallenge)) {
    return bounce("invalid_request", "PKCE S256 code_challenge is required.");
  }
  const resource = canonicalResource(input.resource || mcpResource());
  if (!resource || resource !== mcpResource()) return bounce("invalid_target", "resource must be this MCP server.");
  const asked = input.scope.trim() ? input.scope.trim().split(/\s+/).filter(Boolean) : [MCP_SCOPE];
  if (asked.some((s) => s !== MCP_SCOPE && s !== "offline_access")) return bounce("invalid_scope", "The only scope is mcp.");
  const scope = asked.includes("offline_access") ? `${MCP_SCOPE} offline_access` : MCP_SCOPE;
  return { ok: true, client, input, resource, scope };
}

export async function issueAuthorizationCode(check: Extract<AuthorizeCheck, { ok: true }>): Promise<string> {
  await prisma.oauthCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  const code = randomToken("awcode");
  await prisma.oauthCode.create({
    data: {
      codeHash: sha256(code),
      clientId: check.client.id,
      redirectUri: check.input.redirectUri,
      codeChallenge: check.input.codeChallenge,
      resource: check.resource,
      scope: check.scope,
      expiresAt: new Date(Date.now() + CODE_TTL_S * 1000),
    },
  });
  const url = new URL(check.input.redirectUri);
  url.searchParams.set("code", code);
  url.searchParams.set("state", check.input.state);
  url.searchParams.set("iss", issuer());
  return url.toString();
}

type TokenOk = { status: 200; body: Record<string, unknown> };

async function issueGrant(clientId: string, familyId: string, resource: string, scope: string): Promise<TokenOk> {
  const access = randomToken(ACCESS_PREFIX);
  const refresh = randomToken(REFRESH_PREFIX);
  const now = Date.now();
  await prisma.oauthGrant.create({
    data: {
      clientId,
      familyId,
      accessHash: sha256(access),
      refreshHash: sha256(refresh),
      resource,
      scope,
      accessExpiresAt: new Date(now + ACCESS_TTL_S * 1000),
      refreshExpiresAt: new Date(now + REFRESH_TTL_S * 1000),
    },
  });
  return {
    status: 200,
    body: {
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_S,
      refresh_token: refresh,
      scope,
    },
  };
}

function formResource(value: string, expected: string): OauthFailure | null {
  if (!value) return null;
  const resource = canonicalResource(value);
  if (!resource || resource !== expected) return fail("invalid_target", "resource does not match the token.");
  return null;
}

export async function exchangeToken(params: URLSearchParams): Promise<TokenOk | OauthFailure> {
  const grant = params.get("grant_type") ?? "";
  const clientId = params.get("client_id") ?? "";
  if (params.get("client_secret")) return fail("invalid_client", "This server does not use client secrets.", 401);
  const client = await resolveClient(clientId);
  if ("error" in client) return client;

  if (grant === "authorization_code") {
    const code = params.get("code") ?? "";
    const redirectUri = params.get("redirect_uri") ?? "";
    const verifier = params.get("code_verifier") ?? "";
    if (!code || !redirectUri || !validCodeVerifier(verifier)) return fail("invalid_request", "code, redirect_uri and code_verifier are required.");
    const row = await prisma.oauthCode.findUnique({ where: { codeHash: sha256(code) } });
    if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) return fail("invalid_grant", "Authorization code is invalid or expired.");
    if (row.clientId !== client.id || row.redirectUri !== redirectUri) return fail("invalid_grant", "Authorization code does not match this client.");
    if (pkceS256(verifier) !== row.codeChallenge) return fail("invalid_grant", "PKCE verification failed.");
    const resourceError = formResource(params.get("resource") ?? "", row.resource);
    if (resourceError) return resourceError;
    const consumed = await prisma.oauthCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) return fail("invalid_grant", "Authorization code was already used.");
    return issueGrant(client.id, row.id, row.resource, row.scope);
  }

  if (grant === "refresh_token") {
    const refresh = params.get("refresh_token") ?? "";
    if (!refresh.startsWith(`${REFRESH_PREFIX}_`)) return fail("invalid_grant", "Refresh token is invalid.");
    const row = await prisma.oauthGrant.findUnique({ where: { refreshHash: sha256(refresh) } });
    if (!row || row.clientId !== client.id) return fail("invalid_grant", "Refresh token is invalid.");
    if (row.revokedAt || row.rotatedAt) {
      await prisma.oauthGrant.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      return fail("invalid_grant", "Refresh token was already used and the grant was revoked.");
    }
    if (row.refreshExpiresAt.getTime() < Date.now()) return fail("invalid_grant", "Refresh token has expired.");
    const resourceError = formResource(params.get("resource") ?? "", row.resource);
    if (resourceError) return resourceError;
    const asked = (params.get("scope") ?? "").trim();
    if (asked) {
      const granted = new Set(row.scope.split(" "));
      if (asked.split(/\s+/).some((s) => s && !granted.has(s))) return fail("invalid_scope", "Refresh cannot widen the scope.");
    }
    const rotated = await prisma.oauthGrant.updateMany({ where: { id: row.id, rotatedAt: null, revokedAt: null }, data: { rotatedAt: new Date() } });
    if (rotated.count !== 1) return fail("invalid_grant", "Refresh token was already used.");
    return issueGrant(client.id, row.familyId, row.resource, row.scope);
  }

  return fail("unsupported_grant_type", "grant_type must be authorization_code or refresh_token.");
}

/** Revoke an access or refresh token. Unknown tokens still succeed, per RFC 7009. */
export async function revokeOauthToken(token: string): Promise<void> {
  if (!token) return;
  const hash = sha256(token);
  const row = token.startsWith(`${ACCESS_PREFIX}_`)
    ? await prisma.oauthGrant.findUnique({ where: { accessHash: hash } })
    : token.startsWith(`${REFRESH_PREFIX}_`)
      ? await prisma.oauthGrant.findUnique({ where: { refreshHash: hash } })
      : null;
  if (!row) return;
  await prisma.oauthGrant.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** True when this access token was issued for `resource` and is still live. */
export async function verifyOauthAccess(token: string, resource: string): Promise<boolean> {
  if (!token.startsWith(`${ACCESS_PREFIX}_`)) return false;
  const row = await prisma.oauthGrant.findUnique({ where: { accessHash: sha256(token) } });
  if (!row || row.revokedAt || row.accessExpiresAt.getTime() < Date.now()) return false;
  if (row.resource !== resource || !row.scope.split(" ").includes(MCP_SCOPE)) return false;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.oauthGrant.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return true;
}

export async function listOauthGrants() {
  return prisma.oauthGrant.findMany({
    where: { revokedAt: null, rotatedAt: null },
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeOauthGrant(id: string): Promise<void> {
  const row = await prisma.oauthGrant.findUnique({ where: { id } });
  if (!row) return;
  await prisma.oauthGrant.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export function oauthJson(result: TokenOk | OauthFailure | { client_id: string; body: Record<string, unknown> }, cors: Record<string, string>): Response {
  if ("client_id" in result && "body" in result && !("status" in result)) {
    return Response.json(result.body, { status: 201, headers: { ...cors, "Cache-Control": "no-store" } });
  }
  if ("error" in result) {
    return Response.json(
      { error: result.error, error_description: result.description },
      { status: result.status, headers: { ...cors, "Cache-Control": "no-store" } },
    );
  }
  return Response.json(result.body, { status: 200, headers: { ...cors, "Cache-Control": "no-store" } });
}
