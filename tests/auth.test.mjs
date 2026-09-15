import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateJoinCode,
  hashPassword,
  normaliseJoinCode,
  verifyPassword,
} from "../src/lib/auth/password.ts";

test("a password verifies against its own hash and nothing else", async () => {
  const hash = await hashPassword("cúilín-2026");
  assert.ok(await verifyPassword("cúilín-2026", hash));
  assert.equal(await verifyPassword("cuilin-2026", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("the same password hashes differently every time", async () => {
  // Distinct salts, so two players choosing the same password are not
  // detectable from the stored rows.
  const a = await hashPassword("same-password");
  const b = await hashPassword("same-password");
  assert.notEqual(a, b);
  assert.ok(await verifyPassword("same-password", a));
  assert.ok(await verifyPassword("same-password", b));
});

test("accented passwords survive a round trip", async () => {
  // Normalised to NFKC, so a password typed on a phone matches one typed on
  // a laptop even where the composed form differs.
  const hash = await hashPassword("Pádraiǵ");
  assert.ok(await verifyPassword("Pádraiǵ", hash));
});

test("a malformed stored hash is rejected, not crashed on", async () => {
  assert.equal(await verifyPassword("x", "nonsense"), false);
  assert.equal(await verifyPassword("x", "scrypt$deadbeef"), false);
  assert.equal(await verifyPassword("x", "bcrypt$aa$bb"), false);
  assert.equal(await verifyPassword("x", ""), false);
});

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
