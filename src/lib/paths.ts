/** Path of a URL or an already-bare path. Drops the query, the hash and a trailing slash. */
export function pathOf(u: string): string {
  const p = u.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0] || "/";
  return p.length > 1 ? p.replace(/\/$/, "") : p;
}

/**
 * Sentry culprit when it is a URL or a path. A bare "/" matches every page, so it is ignored.
 * Stack frames and transaction names that are not paths return null.
 */
export function issuePath(culprit: string | null | undefined): string | null {
  if (!culprit) return null;
  const raw = culprit.trim();
  if (!/^https?:\/\//i.test(raw) && !raw.startsWith("/")) return null;
  const path = pathOf(raw);
  if (!path || path === "/") return null;
  return path;
}

/** Issue path equals the page, or sits under it. "/" never matches every page. */
export function pathMatchesPage(issue: string, page: string): boolean {
  return issue === page || issue.startsWith(`${page}/`);
}

export function issuesOnPage(page: string, culprits: (string | null | undefined)[]): number {
  let n = 0;
  for (const culprit of culprits) {
    const path = issuePath(culprit);
    if (path && pathMatchesPage(path, page)) n += 1;
  }
  return n;
}

/** Google clicks on the page this issue points at. The best match wins when several pages fit. */
export function clicksOnIssuePath(
  culprit: string | null | undefined,
  pages: { path: string; searchClicks: number | null }[],
): number {
  const path = issuePath(culprit);
  if (!path) return 0;
  let best = 0;
  for (const page of pages) {
    if (page.searchClicks == null || page.searchClicks <= 0) continue;
    if (pathMatchesPage(path, page.path)) best = Math.max(best, page.searchClicks);
  }
  return best;
}
