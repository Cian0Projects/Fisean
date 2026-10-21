import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/*
 * Crawlers may read the public pages and nothing behind a login: those
 * routes only ever show a sign-in page to a stranger, and /api and the
 * signed media links are not documents. Keep this list in step with
 * sitemap.ts, which names what is meant to be found.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/m/",
        "/admin",
        "/review/",
        "/matches/",
        "/playlists",
        "/drills",
        "/stats",
        "/account",
        "/login",
        "/join",
        "/unsubscribe",
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
