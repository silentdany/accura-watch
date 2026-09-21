export type SiteStatus = "up" | "degraded" | "down" | "unknown";

export type WatchedSite = {
  slug: string;
  name: string;
  url: string;
  status: SiteStatus;
};

/** V1 placeholders — Spec produit */
export const WATCHED_SITES: WatchedSite[] = [
  {
    slug: "accura",
    name: "Accura",
    url: "https://accura.dev",
    status: "up",
  },
  {
    slug: "brieform",
    name: "Brieform",
    url: "https://brieform.app",
    status: "up",
  },
  {
    slug: "watch",
    name: "Watch",
    url: "https://watch.accura.dev",
    status: "degraded",
  },
];
