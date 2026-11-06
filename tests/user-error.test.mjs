import { test } from "node:test";
import assert from "node:assert/strict";
import { errorText } from "../src/lib/user-error.ts";

const FALLBACK = "That could not be saved.";

test("a message we wrote reaches the person", () => {
  assert.equal(errorText(new Error("This browser cannot record video."), FALLBACK), "This browser cannot record video.");
});

test("a server action's hidden message shows the fallback", () => {
  const hidden = new Error(
    "Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.",
  );
  assert.equal(errorText(hidden, FALLBACK), FALLBACK);
  const withDigest = Object.assign(new Error("That playlist is no longer available."), { digest: "123" });
  assert.equal(errorText(withDigest, FALLBACK), FALLBACK);
});

test("errors we did not write show the fallback", () => {
  assert.equal(errorText(new TypeError("Failed to fetch"), FALLBACK), FALLBACK);
  assert.equal(errorText(new Error("see https://example.com"), FALLBACK), FALLBACK);
  assert.equal(errorText(new Error(""), FALLBACK), FALLBACK);
  assert.equal(errorText("a string", FALLBACK), FALLBACK);
  assert.equal(errorText(undefined, FALLBACK), FALLBACK);
});
