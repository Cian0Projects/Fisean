import { test } from "node:test";
import assert from "node:assert/strict";
import { generateJoinCode, normaliseJoinCode } from "../src/lib/auth/password.ts";
import {
  formatCode,
  keyedHash,
  looksLikeEmail,
  newCode,
  newLinkKey,
  normaliseCode,
  normaliseEmail,
  sameHash,
} from "../src/lib/auth/email-code.ts";

test("join codes avoid characters that get misread aloud", () => {
  // No O/0 or I/1 confusion when a manager reads the code out in a dressing room.
  for (let i = 0; i < 200; i++) {
    const code = generateJoinCode();
    assert.equal(code.length, 6);
    assert.match(code, /^[ACDEFGHJKLMNPQRTUVWXY34789]+$/);
  }
});

test("join codes are accepted however they are typed", () => {
  assert.equal(normaliseJoinCode("k7rm q4"), "K7RMQ4");
  assert.equal(normaliseJoinCode("K7RM-Q4"), "K7RMQ4");
  assert.equal(normaliseJoinCode("  k7rmq4  "), "K7RMQ4");
});

test("an email is one account however it is capitalised", () => {
  assert.equal(normaliseEmail("  Cian.OBrien@Example.IE "), "cian.obrien@example.ie");
});

test("only something shaped like an email is sent a code", () => {
  assert.ok(looksLikeEmail("cian@example.ie"));
  assert.ok(looksLikeEmail("a.b+club@mail.example.com"));
  assert.equal(looksLikeEmail("cian"), false);
  assert.equal(looksLikeEmail("cian@example"), false);
  assert.equal(looksLikeEmail("cian @example.ie"), false);
  assert.equal(looksLikeEmail(`${"a".repeat(250)}@example.ie`), false);
});

test("sign-in codes are always six digits, leading zeros kept", () => {
  for (let i = 0; i < 500; i++) assert.match(newCode(), /^\d{6}$/);
});

test("a code is accepted however it was typed or pasted", () => {
  assert.equal(normaliseCode("482 913"), "482913");
  assert.equal(normaliseCode(" 482-913 "), "482913");
  assert.equal(formatCode("042913"), "042 913");
});

test("link keys are long, url safe and never repeat", () => {
  const a = newLinkKey();
  const b = newLinkKey();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

test("a stored hash only matches the same secret, request and code", () => {
  const secret = "s".repeat(64);
  const stored = keyedHash(secret, "request-1", "code:482913");
  assert.ok(sameHash(keyedHash(secret, "request-1", "code:482913"), stored));
  // The same code on another request, or under another secret, is a different hash:
  // a copied database alone is no help in walking the codes.
  assert.equal(sameHash(keyedHash(secret, "request-2", "code:482913"), stored), false);
  assert.equal(sameHash(keyedHash("t".repeat(64), "request-1", "code:482913"), stored), false);
  assert.equal(sameHash(keyedHash(secret, "request-1", "code:482914"), stored), false);
});

test("comparing a hash to nothing is a mismatch, not a crash", () => {
  assert.equal(sameHash("", ""), false);
  assert.equal(sameHash("abcd", ""), false);
});
