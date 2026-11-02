import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  PER_DAY_MAX,
  PER_ERROR_MS,
  REPEAT_COUNT,
  REPEAT_WINDOW_MS,
  buildAlert,
  createThrottle,
  isSevere,
  routeOf,
  scrub,
} from "../src/lib/notify/error-alerts.ts";
import { serverErrorMail } from "../src/lib/mail/templates.ts";

const HOUR = PER_ERROR_MS;

test("the same error on the same route is sent once an hour", () => {
  const t = createThrottle({ repeatCount: 1 });
  assert.equal(t.allow("a", 0), true);
  assert.equal(t.allow("a", HOUR - 1), false);
  assert.equal(t.allow("a", HOUR), true);
});

test("a different error or route is not held back by another", () => {
  const t = createThrottle({ repeatCount: 1 });
  assert.equal(t.allow("a", 0), true);
  assert.equal(t.allow("b", 1), true);
});

test("a suppressed error does not push its own hour further out", () => {
  const t = createThrottle({ repeatCount: 1 });
  t.allow("a", 0);
  t.allow("a", HOUR - 1);
  assert.equal(t.allow("a", HOUR), true);
});

test("no more than twenty a day, whatever the errors", () => {
  const t = createThrottle({ repeatCount: 1 });
  for (let i = 0; i < PER_DAY_MAX; i++) assert.equal(t.allow(`e${i}`, i), true);
  assert.equal(t.allow("another", 100), false);
  // Still shut just inside the day, open again once the first has aged out.
  assert.equal(t.allow("another", DAY_MS - 1), false);
  assert.equal(t.allow("another", DAY_MS), true);
});

test("a refused error is not counted against the day", () => {
  const t = createThrottle({ perDayMax: 2, repeatCount: 1 });
  assert.equal(t.allow("a", 0), true);
  for (let i = 1; i < 10; i++) assert.equal(t.allow("a", i), false);
  assert.equal(t.allow("b", 20), true);
  assert.equal(t.allow("c", 21), false);
});

test("the alert names route, method, message, stack and time", () => {
  const err = new Error("Boom");
  const a = buildAlert({ err, path: "/clips/1?x=1", method: "post", routePath: "/clips/[id]", now: Date.UTC(2026, 10, 1, 9, 30) });
  assert.equal(a.route, "/clips/[id]");
  assert.equal(a.method, "POST");
  assert.equal(a.message, "Boom");
  assert.match(a.stack, /Boom/);
  assert.equal(a.at, "2026-11-01T09:30:00.000Z");
});

test("the same message on two routes is two alerts", () => {
  const e = new Error("Boom");
  const x = buildAlert({ err: e, path: "/a", method: "GET", routePath: "/a", now: 0 });
  const y = buildAlert({ err: e, path: "/b", method: "GET", routePath: "/b", now: 0 });
  assert.notEqual(x.key, y.key);
});

test("a query string never reaches the email", () => {
  assert.equal(routeOf("/login/link?r=%2F&k=abc", undefined), "/login/link");
  assert.equal(routeOf("/x#frag"), "/x");
});

test("sign-in codes and link keys are stripped from message and stack", () => {
  const key = "A".repeat(43);
  assert.equal(scrub("code 482913 and 482 913 and 482-913"), "code [code] and [code] and [code]");
  assert.equal(scrub(`key ${key}`), "key [key]");
  const err = new Error(`bad code 482913 for ${key}`);
  const a = buildAlert({ err, path: "/login", method: "POST", now: 0 });
  assert.doesNotMatch(a.message + a.stack, /482913|AAAAAAAAAA/);
});

test("line numbers and dates are left alone", () => {
  assert.equal(scrub("at f (/app/x.ts:123:45)"), "at f (/app/x.ts:123:45)");
  assert.equal(scrub("2026-11-01T09:30:00.000Z"), "2026-11-01T09:30:00.000Z");
});

test("a thrown string or nothing useful still makes an alert", () => {
  assert.equal(buildAlert({ err: "oops", path: "/", method: "GET", now: 0 }).message, "oops");
  assert.equal(buildAlert({ err: undefined, path: "/", method: "GET", now: 0 }).message, "Unknown error");
});

test("the email carries the facts and escapes the stack", () => {
  const a = buildAlert({ err: new Error("<b>x</b>"), path: "/p", method: "GET", now: 0 });
  const mail = serverErrorMail(a);
  assert.match(mail.subject, /^Server error on \/p/);
  assert.match(mail.text, /Route: \/p/);
  assert.match(mail.text, /Method: GET/);
  assert.doesNotMatch(mail.html, /<b>x<\/b>/);
});

test("a one-off error is not emailed, the third in fifteen minutes is", () => {
  const t = createThrottle();
  assert.equal(REPEAT_COUNT, 3);
  assert.equal(t.allow("a", 0), false);
  assert.equal(t.allow("a", 60_000), false);
  assert.equal(t.allow("a", 120_000), true);
});

test("repeats spread over more than the window never add up", () => {
  const t = createThrottle();
  for (let i = 0; i < 10; i++) assert.equal(t.allow("a", i * REPEAT_WINDOW_MS), false);
});

test("repeats are counted per error, not across different ones", () => {
  const t = createThrottle();
  assert.equal(t.allow("a", 0), false);
  assert.equal(t.allow("b", 1), false);
  assert.equal(t.allow("c", 2), false);
  assert.equal(t.allow("a", 3), false);
});

test("a severe error is emailed the first time", () => {
  const t = createThrottle();
  assert.equal(t.allow("db", 0, true), true);
  // Then the usual hour of quiet, however many follow.
  assert.equal(t.allow("db", 1, true), false);
  assert.equal(t.allow("db", HOUR, true), true);
});

test("the database, disk and storage keys failing are severe", () => {
  for (const m of [
    "SQLITE_CANTOPEN: unable to open database file",
    "database is locked",
    "no such table: clips",
    "ENOSPC: no space left on device",
    "SignatureDoesNotMatch",
    "JavaScript heap out of memory",
  ]) assert.equal(isSevere(m), true, m);
});

test("ordinary errors, and a duplicate row, are not severe", () => {
  for (const m of ["Cannot read properties of undefined", "Clip not found", "SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed"]) {
    assert.equal(isSevere(m), false, m);
  }
});

test("the alert is marked severe from its message", () => {
  assert.equal(buildAlert({ err: new Error("database is locked"), path: "/", method: "GET", now: 0 }).severe, true);
  assert.equal(buildAlert({ err: new Error("Boom"), path: "/", method: "GET", now: 0 }).severe, false);
});

test("the email says why it was sent", () => {
  const base = { route: "/p", method: "GET", message: "x", stack: "", at: "t" };
  assert.match(serverErrorMail({ ...base, severe: true }).text, /app itself is failing/);
  assert.match(serverErrorMail({ ...base, severe: false }).text, /at least 3 times in 15 minutes/);
});
