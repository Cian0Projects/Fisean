import test from "node:test";
import assert from "node:assert/strict";
import { SITE, SITE_TITLE, SITE_DESCRIPTION, homeJsonLd, jsonLdScript } from "../src/lib/seo.ts";

test("the title and description fit what a results page shows", () => {
  assert.ok(SITE_TITLE.length <= 60, `title is ${SITE_TITLE.length} characters`);
  assert.ok(SITE_DESCRIPTION.length >= 120 && SITE_DESCRIPTION.length <= 160, `description is ${SITE_DESCRIPTION.length}`);
});

test("the wording uses no dashes, which the product keeps out of anything a user reads", () => {
  assert.doesNotMatch(`${SITE_TITLE} ${SITE_DESCRIPTION}`, /[–—]| - /);
});

test("the address has no trailing slash, so joined paths do not double up", () => {
  assert.match(SITE, /^https:\/\/[^/]+$/);
});

test("the structured data names the business and the product, and invents no price or rating", () => {
  const graph = homeJsonLd()["@graph"];
  const types = graph.map((n) => n["@type"]);
  assert.deepEqual(types, ["Organization", "WebSite", "SoftwareApplication"]);
  const text = JSON.stringify(graph);
  assert.doesNotMatch(text, /offers|aggregateRating|price/);
  assert.equal(graph[0].name, "Ardawn Sport");
  assert.equal(graph[0].alternateName, "Ardawn");
});

test("script JSON survives a closing tag inside a value", () => {
  const out = jsonLdScript({ name: "</script><script>alert(1)</script>" });
  assert.ok(!out.includes("</script>"));
  assert.equal(JSON.parse(out).name, "</script><script>alert(1)</script>");
});
