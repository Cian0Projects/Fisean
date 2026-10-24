import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_WAIT_MS, QUIET_MS, digestLines, digestSubject, dueUsers } from "../src/lib/notify/digest.ts";
import { clubApprovedMail, clubDeclinedMail, clubReviewMail, digestMail, signInMail } from "../src/lib/mail/templates.ts";

const MIN = 60_000;

test("a burst of shares waits for ten quiet minutes, then goes as one", () => {
  const now = 100 * MIN;
  // Tagging still going on: the newest clip was two minutes ago.
  const busy = [
    { userId: "cian", createdAt: now - 9 * MIN },
    { userId: "cian", createdAt: now - 2 * MIN },
  ];
  assert.deepEqual(dueUsers(busy, now), []);
  // Ten quiet minutes since the last one.
  assert.deepEqual(dueUsers(busy, now + 8 * MIN), ["cian"]);
});

test("nothing waits longer than an hour, however busy the coach is", () => {
  const now = 200 * MIN;
  const steady = [
    { userId: "dara", createdAt: now - MAX_WAIT_MS },
    { userId: "dara", createdAt: now - 1 * MIN },
  ];
  assert.deepEqual(dueUsers(steady, now), ["dara"]);
});

test("each person is timed on their own shares", () => {
  const now = 300 * MIN;
  const rows = [
    { userId: "a", createdAt: now - QUIET_MS },
    { userId: "b", createdAt: now - 1 * MIN },
  ];
  assert.deepEqual(dueUsers(rows, now), ["a"]);
});

test("homework comes first and clips are counted, not listed", () => {
  const lines = digestLines([
    { kind: "clip-tagged", title: "Point from play", href: "/" },
    { kind: "match-footage", title: "v Ballygunner, Sun 13 Sep", href: "/review/v1" },
    { kind: "clip-tagged", title: "Hook", href: "/" },
    { kind: "playlist-assigned", title: "Puckouts to fix", href: "/playlists/p1" },
  ]);
  assert.deepEqual(
    lines.map((l) => l.text),
    [
      "A playlist for you to watch: Puckouts to fix",
      "New footage: v Ballygunner, Sun 13 Sep",
      "You are in 2 new clips",
    ],
  );
});

test("one share is its own subject line; several are counted", () => {
  const one = digestLines([{ kind: "team-playlist", title: "Half time talk", href: "/playlists/p" }]);
  assert.equal(digestSubject(one), "New playlist for the panel: Half time talk");
  const many = digestLines([
    { kind: "team-playlist", title: "A", href: "/playlists/a" },
    { kind: "match-footage", title: "B", href: "/review/b" },
  ]);
  assert.equal(digestSubject(many), "2 new things to watch on Ardawn");
});

// Anything a player reads uses a colon, a comma or a new sentence, never a dash.
const DASHES = /[–—]| - /;

test("the sign-in email carries the code, the link, and no dashes", () => {
  for (const purpose of ["sign-in", "join", "start", "change-email"]) {
    const mail = signInMail({ purpose, code: "042913", link: "https://ardawnsport.ie/login/link?r=x&k=y", teamName: "St Brigid's" });
    assert.match(mail.subject, /^042 913 /);
    assert.ok(mail.text.includes("042 913"));
    assert.ok(mail.text.includes("https://ardawnsport.ie/login/link?r=x&k=y"));
    // The link survives HTML escaping intact once a mail client decodes it.
    assert.ok(mail.html.includes("https://ardawnsport.ie/login/link?r=x&amp;k=y"));
    for (const part of [mail.subject, mail.text, mail.html]) assert.doesNotMatch(part, DASHES);
  }
});

test("the share email links every line and escapes what coaches typed", () => {
  const mail = digestMail({
    name: "Cian Ó Cathasaigh",
    teamName: "St Brigid's",
    lines: [{ text: "New playlist for the panel: <b>Wides</b> & frees", href: "/playlists/p1" }],
    appUrl: "https://ardawnsport.ie",
    unsubscribeUrl: "https://ardawnsport.ie/unsubscribe?u=1&s=2",
    settingsUrl: "https://ardawnsport.ie/account",
  });
  assert.ok(mail.text.startsWith("Hi Cian,"));
  assert.ok(mail.text.includes("https://ardawnsport.ie/playlists/p1"));
  assert.ok(mail.html.includes("&lt;b&gt;Wides&lt;/b&gt; &amp; frees"));
  assert.equal(mail.html.includes("<b>Wides</b>"), false);
  assert.ok(mail.html.includes("Stop these emails"));
  for (const part of [mail.subject, mail.text, mail.html]) assert.doesNotMatch(part, DASHES);
});

test("the host is told who a new club is, what it looks like, and where to answer", () => {
  const review = clubReviewMail({
    clubName: "Kilmacud Crokes <Hurling>",
    game: "Hurling",
    adminName: "Cian",
    adminEmail: "cian@example.ie",
    similar: ["Kilmacud Crokes"],
    reviewUrl: "https://ardawnsport.ie/host/clubs/c1?k=abc",
  });
  assert.equal(review.subject, "New club to check: Kilmacud Crokes <Hurling>");
  assert.ok(review.text.includes("Already on Ardawn with a similar name: Kilmacud Crokes."));
  assert.ok(review.text.includes("https://ardawnsport.ie/host/clubs/c1?k=abc"));
  assert.ok(review.html.includes("Kilmacud Crokes &lt;Hurling&gt;"));
  const none = clubReviewMail({ clubName: "A", game: "Camogie", adminName: "B", adminEmail: "b@x.ie", similar: [], reviewUrl: "u" });
  assert.ok(none.text.includes("No club already on Ardawn has a similar name."));

  const approved = clubApprovedMail({ name: "Cian Ó Cathasaigh", clubName: "St Brigid's", url: "https://ardawnsport.ie/admin" });
  assert.ok(approved.text.startsWith("Hi Cian, St Brigid's is ready on Ardawn."));
  assert.ok(approved.text.includes("https://ardawnsport.ie/admin"));
  const declined = clubDeclinedMail({ name: "Cian", clubName: "St Brigid's" });
  assert.ok(declined.text.includes("hello@ardawnsport.ie"));

  for (const mail of [review, none, approved, declined]) {
    for (const part of [mail.subject, mail.text, mail.html]) assert.doesNotMatch(part, DASHES);
  }
});
