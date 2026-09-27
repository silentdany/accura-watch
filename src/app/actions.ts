"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/require-session";
import { runCollection } from "@/lib/collect";
import { autoMatchSites, createSite, deleteSite, importFromGsc, updateSite } from "@/lib/sites";
import { deleteIntegration, saveIntegration, type ProviderId } from "@/lib/integrations";
import { createApiToken, revokeApiToken } from "@/lib/api-tokens";
import { errorMessage } from "@/lib/http";

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
    if (!ran.length) return "Nothing to sync — connect a provider or add sites.";
    return errors.length
      ? { ok: false, message: `${ran.length - errors.length}/${ran.length} ok · ${errors.map((e) => `${e.site}/${e.source}: ${e.detail}`).join(" · ")}` }
      : `Synced ${ran.length} source${ran.length > 1 ? "s" : ""} in ${(r.durationMs / 1000).toFixed(1)} s`;
  });
}

// ─── Sites ──────────────────────────────────────────────────────────────────

export async function addSiteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const site = await createSite({ domain: field(fd, "domain") ?? "", name: field(fd, "name") || undefined });
    // Kick a first health check + mapped sources so the dashboard isn't empty.
    await runCollection({ siteIds: [site.id], force: true }).catch(() => null);
    return `Added ${site.domain}`;
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
    return "Saved";
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
    if (!props.length) return { ok: false, message: "Select at least one property" };
    const r = await importFromGsc(props);
    if (r.created.length) {
      await runCollection({ siteIds: r.created.map((s) => s.id), sources: ["health"], force: true }).catch(() => null);
    }
    return `Imported ${r.created.length} site${r.created.length === 1 ? "" : "s"}${r.skipped.length ? ` · ${r.skipped.length} already watched` : ""}. Data backfills on the next sync.`;
  });
}

export async function autoMatchAction(): Promise<ActionState> {
  return attempt(async () => {
    const n = await autoMatchSites();
    return n ? `Mapped ${n} field${n > 1 ? "s" : ""}` : "Nothing new to match";
  });
}

// ─── Integrations ───────────────────────────────────────────────────────────

export async function saveIntegrationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const provider = field(fd, "provider") as ProviderId;
    switch (provider) {
      case "google": {
        const json = field(fd, "serviceAccount");
        if (!json) return { ok: false, message: "Paste the service account JSON key" };
        let parsed: { client_email?: string; private_key?: string };
        try {
          parsed = JSON.parse(json);
        } catch {
          return { ok: false, message: "Invalid JSON" };
        }
        if (!parsed.client_email || !parsed.private_key) return { ok: false, message: "JSON must contain client_email and private_key" };
        await saveIntegration("google", { email: parsed.client_email }, {
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
          refreshToken: null,
        });
        return `Service account saved — add ${parsed.client_email} as a user on each Search Console property.`;
      }
      case "posthog":
        await saveIntegration("posthog", { host: field(fd, "host") || "https://us.posthog.com" }, { apiKey: field(fd, "apiKey") });
        return "PostHog saved";
      case "sentry":
        await saveIntegration("sentry", { org: field(fd, "org") || null, host: field(fd, "host") || "https://sentry.io" }, { token: field(fd, "token") });
        return "Sentry saved";
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
        return "DataForSEO saved";
      case "ahrefs":
        await saveIntegration("ahrefs", {}, { apiKey: field(fd, "apiKey") });
        return "Ahrefs saved";
      case "openpagerank":
        await saveIntegration("openpagerank", {}, { apiKey: field(fd, "apiKey") });
        return "Open PageRank saved";
      default:
        return { ok: false, message: "Unknown provider" };
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
    return { ok: true, message: "Token created — copy it now, it won't be shown again.", token };
  });
}

export async function revokeTokenAction(fd: FormData): Promise<void> {
  await guard();
  await revokeApiToken(String(fd.get("id")));
  revalidatePath("/settings");
}
