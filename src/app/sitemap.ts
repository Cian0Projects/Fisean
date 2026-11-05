import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { CODE_PAGES } from "@/lib/code-pages";
import { HOW_TOS } from "@/lib/how-to";

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
    // One page per code, each for that code's searches (src/lib/code-pages.ts).
    ...CODE_PAGES.map((p) => ({ url: `${SITE}${p.path}`, priority: 0.9 })),
    { url: `${SITE}/start`, priority: 0.8 },
    // The public how-to guides (src/lib/how-to.ts).
    { url: `${SITE}/how-to`, priority: 0.7 },
    ...HOW_TOS.map((h) => ({ url: `${SITE}/how-to/${h.slug}`, priority: 0.7 })),
    { url: `${SITE}/privacy`, priority: 0.5 },
    { url: `${SITE}/privacy/agreement`, priority: 0.3 },
  ];
}
