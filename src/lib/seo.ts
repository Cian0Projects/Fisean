/**
 * What search engines and shared links are told about Ardawn, in one place so
 * the layout, the sitemap, robots.txt and the structured data cannot disagree
 * about the address or the wording.
 *
 * The address is written out rather than read from APP_URL: these are public
 * facts about the live site, and a build with APP_URL unset (or set to a
 * staging host) must not leak that into the canonical links Google keeps.
 */
export const SITE = "https://ardawnsport.ie";

export const SITE_TITLE = "Ardawn: GAA video review for hurling, camogie and football";

export const SITE_DESCRIPTION =
  "Upload the match, clip it, log the stats and plan training. Video review for hurling, camogie, Gaelic football and ladies football clubs, on any phone.";

/**
 * The share-card fields for a page with its own title and description.
 *
 * Next replaces a layout's `openGraph` and `twitter` wholesale when a page
 * sets its own, so a page that only sets `title` would be shared under the
 * home page's title. A page spreads this in beside its title instead.
 */
export function socialFor(title: string, description: string) {
  return {
    openGraph: { type: "website" as const, siteName: "Ardawn", locale: "en_IE", title, description },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}

/**
 * The home page's structured data: who runs the site, the site itself, and
 * the product. Deliberately without a price or a rating, because neither
 * exists yet and a made-up one is a policy violation, not an optimisation.
 *
 * "Ardawn Sport" is the name the domain and the business carry; "Ardawn" is
 * what the product is called on screen. Naming both lets a search for either
 * reach the same site.
 */
export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "Ardawn Sport",
        alternateName: "Ardawn",
        url: SITE,
        logo: `${SITE}/icon/512`,
        email: "hello@ardawnsport.ie",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: SITE,
        name: "Ardawn",
        alternateName: ["Ardawn Sport", "ardawnsport.ie"],
        inLanguage: "en-IE",
        publisher: { "@id": `${SITE}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE}/#app`,
        name: "Ardawn",
        applicationCategory: "SportsApplication",
        operatingSystem: "Any device with a web browser",
        description: SITE_DESCRIPTION,
        url: SITE,
        publisher: { "@id": `${SITE}/#organization` },
      },
    ],
  };
}

/**
 * JSON for a `<script type="application/ld+json">`. `<` is escaped so that a
 * string containing `</script>` can never close the tag early; today every
 * value is a constant, but the escape costs nothing and the next person to
 * add a field should not have to remember it.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
