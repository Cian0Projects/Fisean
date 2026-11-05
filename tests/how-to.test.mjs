import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { HOW_TOS, HOW_TO_INDEX, howToJsonLd, howToMetadata } from "../src/lib/how-to.ts";
import { GUIDES } from "../src/lib/guides.ts";
import { CODE_PAGES } from "../src/lib/code-pages.ts";
import { SITE, SITE_TITLE } from "../src/lib/seo.ts";

function words(h) {
  return [
    h.heading,
    h.title,
    h.description,
    h.blurb,
    h.intro,
    h.who,
    h.image?.alt ?? "",
    ...h.steps.flatMap((s) => [s.title, s.text]),
    ...h.tips.flatMap((t) => [t.title, t.text]),
  ];
}

test("each guide has its own address", () => {
  const slugs = HOW_TOS.map((h) => h.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) assert.match(slug, /^[a-z]+(-[a-z]+)*$/);
});

test("titles and descriptions fit a results page, and none repeats another page's", () => {
  const pages = [...HOW_TOS, HOW_TO_INDEX];
  for (const p of pages) {
    assert.ok(p.title.length <= 60, `${p.title} is ${p.title.length} characters`);
    assert.ok(
      p.description.length >= 120 && p.description.length <= 160,
      `${p.title}: description is ${p.description.length} characters`,
    );
  }
  const titles = [SITE_TITLE, ...CODE_PAGES.map((p) => p.title), ...pages.map((p) => p.title)];
  assert.equal(new Set(titles).size, titles.length);
});

test("the wording uses no dashes", () => {
  for (const h of HOW_TOS) {
    for (const w of words(h)) assert.doesNotMatch(w, /[–—]| - /, `${h.slug}: ${w}`);
  }
});

test("every picture is a public file, and none is one of the members' videos", () => {
  for (const h of HOW_TOS) {
    if (!h.image) continue;
    assert.ok(h.image.src.startsWith("/"), h.slug);
    assert.ok(existsSync(`public${h.image.src}`), `missing public${h.image.src}`);
    assert.doesNotMatch(h.image.src, /\.(mp4|webm)$/);
  }
});

test("a guide that points to a members' video names one that exists and is kept for members", () => {
  for (const h of HOW_TOS) {
    if (!h.video) continue;
    const video = GUIDES.find((g) => g.slug === h.video);
    assert.ok(video, `${h.slug} points to ${h.video}`);
    assert.equal(video.open, false, `${h.video} is already public`);
  }
});

test("each guide names its canonical address and share card", () => {
  for (const h of HOW_TOS) {
    const meta = howToMetadata(h);
    assert.equal(meta.alternates.canonical, `/how-to/${h.slug}`);
    assert.equal(meta.openGraph.title, h.title);
  }
});

test("the breadcrumb runs home, how to, guide", () => {
  const [first] = HOW_TOS;
  assert.deepEqual(
    howToJsonLd(first).itemListElement.map((i) => i.item),
    [`${SITE}/`, `${SITE}/how-to`, `${SITE}/how-to/${first.slug}`],
  );
  assert.equal(howToJsonLd().itemListElement.length, 2);
});
