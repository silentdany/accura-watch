"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/require-session";
import { runCollection } from "@/lib/collect";
import { autoMatchSites, createSite, deleteSite, importFromGsc, updateSite } from "@/lib/sites";
import { deleteIntegration, saveIntegration, type ProviderId } from "@/lib/integrations";
import { createApiToken, revokeApiToken } from "@/lib/api-tokens";
import { errorMessage } from "@/lib/http";
import { normalizePrivateKey } from "@/lib/google-key";
import { cookies } from "next/headers";
import { getI18n } from "@/i18n/server";
import { isLocale, LOCALE_COOKIE, THEME_COOKIE } from "@/i18n";

export type ActionState = { ok: boolean; message: string; token?: string } | null;

async function guard() {
  if (!(await getServerSession())) throw new Error("Not signed in");
}

async function attempt(fn: () => Promise<string | ActionState>): Promise<ActionState> {
  try {
    await guard();
    const r = await fn();
    revalidatePath("/", "layout");
    return typeof r === "string" ? { ok: true, message: r } : r;
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

const field = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : undefined;
};

// ─── Sync ───────────────────────────────────────────────────────────────────

export async function syncNowAction(siteId?: string): Promise<ActionState> {
  return attempt(async () => {
    const r = await runCollection({ siteIds: siteId ? [siteId] : undefined, force: true });
    const ran = r.results.filter((x) => x.status === "ok" || x.status === "error");
    const errors = ran.filter((x) => x.status === "error");
    const { t, f } = await getI18n();
    if (!ran.length) return t.sync.nothing;
    return errors.length
      ? { ok: false, message: `${t.sync.done(ran.length - errors.length, ran.length)} · ${errors.map((e) => `${e.site}/${e.source}: ${e.detail}`).join(" · ")}` }
      : t.sync.success(ran.length, f.dec(r.durationMs / 1000, 1));
  });
}

// ─── Sites ──────────────────────────────────────────────────────────────────

export async function addSiteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const site = await createSite({ domain: field(fd, "domain") ?? "", name: field(fd, "name") || undefined });
    // Kick a first health check + mapped sources so the dashboard isn't empty.
    await runCollection({ siteIds: [site.id], force: true }).catch(() => null);
    return (await getI18n()).t.actions.added(site.domain);
  });
}

export async function updateSiteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const id = field(fd, "id")!;
    await updateSite(id, {
      name: field(fd, "name"),
      url: field(fd, "url") || undefined,
      gscProperty: field(fd, "gscProperty") ?? "",
      posthogProjectId: field(fd, "posthogProjectId") ?? "",
      posthogHost: field(fd, "posthogHost") ?? "",
      sentryProject: field(fd, "sentryProject") ?? "",
      active: fd.get("active") === "on",
      pinned: fd.get("pinned") === "on",
    });
    return (await getI18n()).t.actions.saved;
  });
}

export async function deleteSiteAction(fd: FormData): Promise<void> {
  await guard();
  await deleteSite(String(fd.get("id")));
  revalidatePath("/", "layout");
}

export async function togglePinAction(fd: FormData): Promise<void> {
  await guard();
  await updateSite(String(fd.get("id")), { pinned: fd.get("pinned") !== "true" });
  revalidatePath("/", "layout");
}

export async function importGscAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const props = fd.getAll("property").map(String).filter(Boolean);
    const { t } = await getI18n();
    if (!props.length) return { ok: false, message: t.actions.selectOne };
    const r = await importFromGsc(props);
    if (r.created.length) {
      await runCollection({ siteIds: r.created.map((s) => s.id), sources: ["health"], force: true }).catch(() => null);
    }
    return t.actions.imported(r.created.length, r.skipped.length);
  });
}

export async function autoMatchAction(): Promise<ActionState> {
  return attempt(async () => {
    const n = await autoMatchSites();
    const { t } = await getI18n();
    return n ? t.actions.matched(n) : t.actions.nothingToMatch;
  });
}

// ─── Integrations ───────────────────────────────────────────────────────────

export async function saveIntegrationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const provider = field(fd, "provider") as ProviderId;
    const { t } = await getI18n();
    switch (provider) {
      case "google": {
        const json = field(fd, "serviceAccount");
        if (!json) return { ok: false, message: t.actions.pasteJson };
        let parsed: { client_email?: string; private_key?: string };
        try {
          parsed = JSON.parse(json);
        } catch {
          return { ok: false, message: t.actions.invalidJson };
        }
        if (!parsed.client_email || !parsed.private_key) return { ok: false, message: t.actions.jsonFields };
        normalizePrivateKey(parsed.private_key); // throws a readable error if unusable
        await saveIntegration("google", { email: parsed.client_email }, {
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
          refreshToken: null,
        });
        return t.actions.serviceAccountSaved(parsed.client_email);
      }
      case "posthog":
        await saveIntegration("posthog", { host: field(fd, "host") || "https://us.posthog.com" }, { apiKey: field(fd, "apiKey") });
        return t.actions.providerSaved("PostHog");
      case "sentry":
        await saveIntegration("sentry", { org: field(fd, "org") || null, host: field(fd, "host") || "https://sentry.io" }, { token: field(fd, "token") });
        return t.actions.providerSaved("Sentry");
      case "dataforseo":
        await saveIntegration(
          "dataforseo",
          {
            locationCode: Number(field(fd, "locationCode")) || 2840,
            languageCode: field(fd, "languageCode") || "en",
            backlinks: fd.get("backlinks") === "on",
            cadenceDays: Math.max(1, Number(field(fd, "cadenceDays")) || 7),
          },
          { login: field(fd, "login"), password: field(fd, "password") },
        );
        return t.actions.providerSaved("DataForSEO");
      case "ahrefs":
        await saveIntegration("ahrefs", {}, { apiKey: field(fd, "apiKey") });
        return t.actions.providerSaved("Ahrefs");
      case "openpagerank":
        await saveIntegration("openpagerank", {}, { apiKey: field(fd, "apiKey") });
        return t.actions.providerSaved("Open PageRank");
      default:
        return { ok: false, message: t.actions.unknownProvider };
    }
  });
}

export async function disconnectIntegrationAction(fd: FormData): Promise<void> {
  await guard();
  await deleteIntegration(String(fd.get("provider")) as ProviderId);
  revalidatePath("/", "layout");
}

// ─── API tokens ─────────────────────────────────────────────────────────────

export async function createTokenAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { token } = await createApiToken(field(fd, "name") || "MCP client");
    return { ok: true, message: (await getI18n()).t.settings.tokenCreated, token };
  });
}

export async function revokeTokenAction(fd: FormData): Promise<void> {
  await guard();
  await revokeApiToken(String(fd.get("id")));
  revalidatePath("/settings");
}

// ─── Preferences ────────────────────────────────────────────────────────────

const YEAR = 60 * 60 * 24 * 365;

export async function setLocaleAction(fd: FormData): Promise<void> {
  const v = String(fd.get("locale"));
  if (isLocale(v)) (await cookies()).set(LOCALE_COOKIE, v, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function setThemeAction(fd: FormData): Promise<void> {
  const v = String(fd.get("theme"));
  const jar = await cookies();
  if (v === "light" || v === "dark") jar.set(THEME_COOKIE, v, { path: "/", maxAge: YEAR, sameSite: "lax" });
  else jar.delete(THEME_COOKIE);
  revalidatePath("/", "layout");
}
