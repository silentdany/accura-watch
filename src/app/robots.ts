import type { MetadataRoute } from "next";

/** Private dashboard: nothing to index. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
