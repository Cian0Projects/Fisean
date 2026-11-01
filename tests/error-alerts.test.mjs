import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  PER_DAY_MAX,
  PER_ERROR_MS,
  buildAlert,
  createThrottle,
  routeOf,
  scrub,
} from "../src/lib/notify/error-alerts.ts";
import { serverErrorMail } from "../src/lib/mail/templates.ts";

const HOUR = PER_ERROR_MS;

test("the same error on the same route is sent once an hour", () => {
  const t = createThrottle();
  assert.equal(t.allow("a", 0), true);
  assert.equal(t.allow("a", HOUR - 1), false);
  assert.equal(t.allow("a", HOUR), true);
});

test("a different error or route is not held back by another", () => {
  const t = createThrottle();
  assert.equal(t.allow("a", 0), true);
  assert.equal(t.allow("b", 1), true);
});

test("a suppressed error does not push its own hour further out", () => {
  const t = createThrottle();
  t.allow("a", 0);
  t.allow("a", HOUR - 1);
  assert.equal(t.allow("a", HOUR), true);
});

test("no more than twenty a day, whatever the errors", () => {
  const t = createThrottle();
  for (let i = 0; i < PER_DAY_MAX; i++) assert.equal(t.allow(`e${i}`, i), true);
  assert.equal(t.allow("another", 100), false);
  // Still shut just inside the day, open again once the first has aged out.
  assert.equal(t.allow("another", DAY_MS - 1), false);
  assert.equal(t.allow("another", DAY_MS), true);
});

test("a refused error is not counted against the day", () => {
  const t = createThrottle({ perDayMax: 2 });
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
