import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLineupCsv } from "../src/lib/hurling/lineup-csv.ts";

test("a number and a name per row, with or without a heading", () => {
  const withHeading = parseLineupCsv("Number,Name\r\n1,Seán Murphy\r\n2,Conor Walsh");
  const without = parseLineupCsv("1,Seán Murphy\n2,Conor Walsh");
  const want = [
    { number: 1, name: "Seán Murphy" },
    { number: 2, name: "Conor Walsh" },
  ];
  assert.deepEqual(withHeading.rows, want);
  assert.deepEqual(without.rows, want);
  assert.deepEqual(withHeading.problems, []);
});

test("the name can come first, and a heading keeps other columns out of it", () => {
  const r = parseLineupCsv("Player,Position,No\nSeán Murphy,Goalkeeper,#1\nConor Walsh,Full back,No. 2");
  assert.deepEqual(r.rows, [
    { number: 1, name: "Seán Murphy" },
    { number: 2, name: "Conor Walsh" },
  ]);
});

test("a first and last name in two cells are joined", () => {
  const r = parseLineupCsv("7;Seán;Murphy");
  assert.deepEqual(r.rows, [{ number: 7, name: "Seán Murphy" }]);
});

test("a repeated number or name is left out and said", () => {
  const r = parseLineupCsv("1,Seán Murphy\n1,Conor Walsh\n2,seán  murphy");
  assert.deepEqual(r.rows, [{ number: 1, name: "Seán Murphy" }]);
  assert.equal(r.problems.length, 2);
});

test("numbers out of range, missing names and rows with no number are problems", () => {
  const r = parseLineupCsv("Number,Name\n0,Nobody\n5,\nTwo,Conor Walsh\n9,Aoife Byrne");
  assert.deepEqual(r.rows, [{ number: 9, name: "Aoife Byrne" }]);
  assert.equal(r.problems.length, 3);
});

test("a file with no players says so", () => {
  assert.ok(parseLineupCsv("").error);
  assert.ok(parseLineupCsv("Number,Name\nnone,here").error);
});
