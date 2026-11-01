import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, homeKit, parseColour } from "../src/lib/hurling/kit.ts";

test("a colour is a six digit hex, lower-cased, and nothing else", () => {
  assert.equal(parseColour("#1F2F96"), "#1f2f96");
  assert.equal(parseColour("  #ffffff "), "#ffffff");
  for (const bad of ["", "red", "#fff", "#12345g", "1f2f96", "#1f2f96;}", "url(x)", null, undefined, 7]) {
    assert.equal(parseColour(bad), null, String(bad));
  }
});

test("contrast runs from 1 to 21", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#336699", "#336699"), 1);
});

test("without a primary the board keeps its own colours", () => {
  assert.equal(homeKit({ primary: null, secondary: null }), null);
  assert.equal(homeKit({ primary: null, secondary: "#ffd400" }), null);
  assert.equal(homeKit({ primary: "nonsense", secondary: "#ffd400" }), null);
});

test("a readable secondary is the number and the trim", () => {
  const kit = homeKit({ primary: "#0b2a6f", secondary: "#ffd400" });
  assert.deepEqual(kit, { fill: "#0b2a6f", trim: "#ffd400", label: "#ffd400" });
});

test("a secondary too close to the primary keeps its trim but not the number", () => {
  const kit = homeKit({ primary: "#0b2a6f", secondary: "#0e3380" });
  assert.equal(kit.trim, "#0e3380");
  assert.equal(kit.label, "#ffffff");
});

test("no secondary: the trim vanishes into the disc and the number is white or near black", () => {
  assert.deepEqual(homeKit({ primary: "#0b2a6f", secondary: null }), {
    fill: "#0b2a6f",
    trim: "#0b2a6f",
    label: "#ffffff",
  });
  assert.equal(homeKit({ primary: "#f5d90a", secondary: null }).label, "#111317");
});

test("an invalid secondary is treated as none", () => {
  assert.equal(homeKit({ primary: "#0b2a6f", secondary: "gold" }).trim, "#0b2a6f");
});
