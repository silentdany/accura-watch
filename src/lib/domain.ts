/** Normalize user input ("https://www.Example.com/path", "sc-domain:example.com") to "example.com". */
export function normalizeDomain(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith("sc-domain:")) raw = raw.slice("sc-domain:".length);
  if (!/^[a-z]+:\/\//.test(raw)) raw = `https://${raw}`;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/** Default public URL for a GSC property or a bare domain. */
export function urlFor(input: string): string {
  if (/^https?:\/\//i.test(input)) {
    try {
      const u = new URL(input);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* fall through */
    }
  }
  const domain = normalizeDomain(input);
  return `https://${domain ?? input}`;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "site"
  );
}

/** "brieform.app" → "Brieform", "directoryfa.st" → "Directoryfa" */
export function nameFromDomain(domain: string): string {
  const label = domain.split(".")[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Loose token used to auto-match provider projects to a site. */
export function matchKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function faviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}
