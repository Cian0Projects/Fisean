import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { GUIDES, guideFile, guideForFile, guidesFor, guideUrl, openGuides } from "../src/lib/guides.ts";

const dirOf = (g) => new URL(g.open ? "../public/guides/" : "../content/guides/", import.meta.url);

test("every guide has its video and poster where its kind says", () => {
  for (const g of GUIDES) {
    for (const kind of ["video", "poster"]) {
      assert.ok(existsSync(new URL(guideFile(g.slug, kind), dirOf(g))), `${g.slug} ${kind}`);
    }
  }
});

test("a members only video is never also a public file", () => {
  for (const g of GUIDES.filter((x) => !x.open)) {
    assert.ok(!existsSync(new URL(guideFile(g.slug, "video"), new URL("../public/guides/", import.meta.url))), g.slug);
  }
});

test("open videos are served as plain files, the rest through the gate", () => {
  for (const g of GUIDES) {
    assert.equal(guideUrl(g, "video").startsWith(g.open ? "/guides/" : "/api/guides/"), true, g.slug);
  }
  assert.deepEqual(openGuides().map((g) => g.slug), ["set-up-your-club", "join-your-panel"]);
});

test("a player is not shown the coaches' tools, and only an admin is shown club set up", () => {
  const slugs = (role) => guidesFor(role).map((g) => g.slug);
  assert.deepEqual(slugs("player"), ["join-your-panel", "make-a-clip"]);
  assert.equal(slugs("coach").includes("make-a-drill"), true);
  assert.equal(slugs("coach").includes("set-up-your-club"), false);
  assert.equal(slugs("admin").includes("set-up-your-club"), true);
  assert.equal(slugs("admin").length, GUIDES.length);
});

test("only a listed file name is ever asked for", () => {
  assert.equal(guideForFile("make-a-drill.mp4")?.kind, "video");
  assert.equal(guideForFile("make-a-drill.jpg")?.kind, "poster");
  for (const bad of ["../package.json", "make-a-drill.mp4/../x", "nope.mp4", "make-a-drill", ""]) {
    assert.equal(guideForFile(bad), null, bad);
  }
});

test("titles and blurbs carry no dashes", () => {
  for (const g of GUIDES) assert.doesNotMatch(`${g.title} ${g.blurb}`, /[–—]| - /, g.slug);
});
