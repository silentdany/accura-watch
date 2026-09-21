/** Sites watched by Accura Watch. Extend via config later. */
export type SiteId = "accura" | "brieform";

export type Site = {
  id: SiteId;
  name: string;
  url: string;
};

export const SITES: Site[] = [
  { id: "accura", name: "Accura", url: "https://accura.dev" },
  { id: "brieform", name: "Brieform", url: "https://brieform.app" },
];
