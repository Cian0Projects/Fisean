import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/*
 * The public pages only: the ones a stranger can read without signing in.
 * Everything behind a login is left out on purpose (and blocked in
 * robots.ts), since a crawler would only ever see the sign-in page there.
 *
 * No lastModified: a date that is always "now" teaches Google to ignore the
 * field. Add real dates here if these pages start changing often.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, priority: 1 },
    { url: `${SITE}/start`, priority: 0.8 },
    { url: `${SITE}/privacy`, priority: 0.5 },
    { url: `${SITE}/privacy/agreement`, priority: 0.3 },
  ];
}
