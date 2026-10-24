import { test } from "node:test";
import assert from "node:assert/strict";
import { clubWords, similarClubs } from "../src/lib/hurling/club-names.ts";

test("club words drop what every club shares, accents and apostrophes", () => {
  assert.deepEqual(clubWords("St. Brigid's GAA Club"), ["brigids"]);
  assert.deepEqual(clubWords("Na Piarsaigh Hurling"), ["piarsaigh"]);
  assert.deepEqual(clubWords("Cumann Lúthchleas Gael Ráth Tó"), ["rath"]);
  assert.deepEqual(clubWords("U16 camogie"), ["u16"]);
});

test("the same club under another name is listed", () => {
  const existing = [
    { id: "a", name: "Kilmacud Crokes" },
    { id: "b", name: "St Brigids GAA" },
    { id: "c", name: "Ballyhale Shamrocks" },
  ];
  assert.deepEqual(similarClubs("Kilmacud Crokes Hurling", existing).map((c) => c.id), ["a"]);
  assert.deepEqual(similarClubs("St. Brigid's Camogie", existing).map((c) => c.id), ["b"]);
  assert.deepEqual(similarClubs("Thomastown GAA", existing), []);
});

test("a name made only of common words matches nothing rather than everything", () => {
  assert.deepEqual(similarClubs("GAA Club", [{ name: "Any GAA Club" }]), []);
});
