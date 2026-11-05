import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { GAME_CODES } from "../src/lib/hurling/codes.ts";
import { CODE_PAGES, codePageJsonLd, codePageMetadata } from "../src/lib/code-pages.ts";
import { SITE, SITE_TITLE } from "../src/lib/seo.ts";

/* Every string a visitor can read on the four pages, title to last answer. */
function words(page) {
  return [
    page.label,
    page.named,
    page.title,
    page.description,
    page.headline,
    page.intro,
    ...Object.values(page.features),
    ...page.rules.flatMap((r) => [r.name, r.text]),
    ...page.screens.flatMap((s) => [s.name, s.title, s.text, s.image?.alt ?? ""]),
    ...page.questions.flatMap((q) => [q.q, q.a]),
  ];
}

test("every code has exactly one page, each at its own address", () => {
  assert.deepEqual(
    CODE_PAGES.map((p) => p.code).sort(),
    [...GAME_CODES].sort(),
  );
  const paths = CODE_PAGES.map((p) => p.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const path of paths) assert.match(path, /^\/[a-z-]+$/);
});

test("titles and descriptions fit a results page, and none repeats another or the home page's", () => {
  for (const p of CODE_PAGES) {
    assert.ok(p.title.length <= 60, `${p.path} title is ${p.title.length} characters`);
    assert.ok(
      p.description.length >= 120 && p.description.length <= 160,
      `${p.path} description is ${p.description.length} characters`,
    );
  }
  const titles = [SITE_TITLE, ...CODE_PAGES.map((p) => p.title)];
  assert.equal(new Set(titles).size, titles.length);
  const descriptions = CODE_PAGES.map((p) => p.description);
  assert.equal(new Set(descriptions).size, descriptions.length);
});

test("the wording uses no dashes", () => {
  for (const p of CODE_PAGES) {
    for (const w of words(p)) assert.doesNotMatch(w, /[–—]| - /, `${p.path}: ${w}`);
  }
});

test("no page uses another code's words for the restart, the end-line free or the ball", () => {
  for (const p of CODE_PAGES) {
    const text = words(p).join(" ");
    const football = p.code === "football" || p.code === "ladies_football";
    if (football) {
      assert.doesNotMatch(text, /poc amach|puck-?out|sliotar|\b65\b/i, p.path);
    } else {
      assert.doesNotMatch(text, /kick-?out|two-point|\bmark\b/i, p.path);
    }
    if (p.code === "camogie") {
      // Camogie's end-line free is a 45. The 65 appears only as the line
      // deliveries are measured from, and as what the free is not.
      const freeAsSixtyFive = /(?:won|winning|put out for|taken from there is) a 65/i;
      assert.doesNotMatch(text, freeAsSixtyFive, p.path);
    }
  }
});

test("each code shows its own game: its own clipping screen, and the drill board with its own ball", () => {
  const clipping = CODE_PAGES.map((p) => p.screens.find((s) => s.name === "Clipping")?.image?.src);
  assert.ok(clipping.every(Boolean), "every code has a clipping screen");
  assert.equal(new Set(clipping).size, clipping.length, "no code borrows another's clipping screen");
  for (const p of CODE_PAGES) {
    const images = p.screens.map((s) => s.image?.src).filter(Boolean);
    for (const src of images) assert.ok(existsSync(`public${src}`), `missing public${src}`);
    const football = p.code === "football" || p.code === "ladies_football";
    assert.ok(images.includes(football ? "/home/drill-football-overlap.jpg" : "/home/drill-dark.jpg"), p.path);
    assert.ok(!images.includes(football ? "/home/drill-dark.jpg" : "/home/drill-football-overlap.jpg"), p.path);
  }
});

test("each page names its own canonical address and share card", () => {
  for (const p of CODE_PAGES) {
    const meta = codePageMetadata(p.code);
    assert.equal(meta.alternates.canonical, p.path);
    assert.equal(meta.openGraph.title, p.title);
    assert.equal(meta.twitter.description, p.description);
  }
});

test("the breadcrumb runs from the home page to the code's page, on the live address", () => {
  const crumb = codePageJsonLd("football");
  assert.equal(crumb["@type"], "BreadcrumbList");
  assert.deepEqual(
    crumb.itemListElement.map((i) => i.item),
    [`${SITE}/`, `${SITE}/gaelic-football`],
  );
});
