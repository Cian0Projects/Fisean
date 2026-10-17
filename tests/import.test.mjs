import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filenameFor,
  findVideoLink,
  isPublicAddress,
  readSourceLink,
  suggestMatch,
  totalFromContentRange,
} from "../src/lib/media/import.ts";
import { GAME_CODES, ballFor, isGameCode } from "../src/lib/hurling/codes.ts";

test("the first link in a pasted email is the one taken, and its app recognised", () => {
  const read = readSourceLink(
    "Hi,\nYour export is ready: https://exports.pixellot.tv/files/abc123.mp4?token=xyz.\nThanks",
  );
  assert.ok("url" in read);
  assert.equal(read.source, "pixellot");
  assert.equal(read.url.href, "https://exports.pixellot.tv/files/abc123.mp4?token=xyz");
});

test("text with no link in it asks for the whole link", () => {
  const read = readSourceLink("app.veo.co/matches/123");
  assert.ok("error" in read);
});

test("a Dropbox share link becomes a download link", () => {
  const read = readSourceLink("https://www.dropbox.com/scl/fi/abc/match.mp4?rlkey=k&dl=0");
  assert.ok("url" in read);
  assert.equal(read.source, "dropbox");
  assert.equal(read.url.searchParams.get("dl"), "1");
  assert.equal(read.url.searchParams.get("rlkey"), "k");
});

test("a Google Drive share link becomes a direct download, past the virus scan page", () => {
  const read = readSourceLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp_qr-st/view?usp=sharing");
  assert.ok("url" in read);
  assert.equal(read.source, "drive");
  assert.equal(read.url.hostname, "drive.usercontent.google.com");
  assert.equal(read.url.searchParams.get("id"), "1AbCdEfGhIjKlMnOp_qr-st");
  assert.equal(read.url.searchParams.get("confirm"), "t");
});

test("YouTube links are turned away with what to do instead", () => {
  const read = readSourceLink("https://www.youtube.com/watch?v=abc");
  assert.ok("error" in read);
  assert.match(read.error, /YouTube Studio/);
});

test("links with a password or an odd port are refused", () => {
  assert.ok("error" in readSourceLink("https://user:pw@example.com/a.mp4"));
  assert.ok("error" in readSourceLink("https://example.com:8080/a.mp4"));
  assert.ok("url" in readSourceLink("https://example.com:443/a.mp4"));
});

test("private, loopback and metadata addresses are never fetched", () => {
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1",
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "104.18.2.3", "2606:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test("the file's name comes from the header, then the address, and must be a playable video", () => {
  const url = new URL("https://cdn.example.com/x/y/download");
  assert.equal(
    filenameFor({ contentDisposition: 'attachment; filename="Ballygunner v Sarsfields.mp4"', contentType: "video/mp4", url }),
    "Ballygunner v Sarsfields.mp4",
  );
  assert.equal(
    filenameFor({ contentDisposition: "attachment; filename*=UTF-8''Cl%C3%A1rach%20final.mp4", contentType: "application/octet-stream", url }),
    "Clárach final.mp4",
  );
  assert.equal(
    filenameFor({ contentType: "video/mp4", url: new URL("https://cdn.example.com/files/abc.mp4?sig=1") }),
    "abc.mp4",
  );
  // A video type with no extension gets one; an unknown file with neither is refused.
  assert.equal(filenameFor({ contentType: "video/quicktime", url }), "download.mov");
  assert.equal(filenameFor({ contentType: "application/octet-stream", url }), null);
  assert.equal(filenameFor({ contentType: "text/html", url: new URL("https://a.com/x.mp4") }), null);
  // Folders in a name never survive.
  assert.equal(
    filenameFor({ contentDisposition: 'attachment; filename="../../etc/match.mp4"', contentType: "video/mp4", url }),
    "match.mp4",
  );
});

test("the total size is read from a ranged answer", () => {
  assert.equal(totalFromContentRange("bytes 0-0/3221225472"), 3221225472);
  assert.equal(totalFromContentRange("bytes 0-0/*"), null);
  assert.equal(totalFromContentRange(null), null);
});

test("a page that opens instead of the file still gives up its video", () => {
  const base = new URL("https://share.example.com/m/1");
  assert.equal(
    findVideoLink('<meta property="og:video" content="https://cdn.example.com/m1.mp4?t=a&amp;s=b">', base)?.href,
    "https://cdn.example.com/m1.mp4?t=a&s=b",
  );
  assert.equal(
    findVideoLink('<script>var src = "https:\\/\\/cdn.example.com\\/full\\/game.mp4?k=1\\u0026e=2";</script>', base)?.href,
    "https://cdn.example.com/full/game.mp4?k=1&e=2",
  );
  assert.equal(findVideoLink("<html><body>Sign in to continue</body></html>", base), null);
});

test("the match is guessed from the file's name: opponent and date", () => {
  assert.deepEqual(suggestMatch("Ballygunner v Sarsfields 2026-07-12.mp4", null, "2026-10-17"), {
    title: "Sarsfields",
    playedOn: "2026-07-12",
  });
  assert.deepEqual(suggestMatch("veo_full_match_12-07-2026_Clarach_vs_Mungret.mp4", null, "2026-10-17"), {
    title: "Mungret",
    playedOn: "2026-07-12",
  });
  assert.deepEqual(suggestMatch("St Brigids 14th Sept 2025.mov", null, "2026-10-17"), {
    title: "St Brigids",
    playedOn: "2025-09-14",
  });
});

test("with no date in the name, the file's own date is used, never a future one", () => {
  assert.equal(suggestMatch("Na Piarsaigh.mp4", "Sun, 03 Aug 2025 18:00:00 GMT", "2026-10-17").playedOn, "2025-08-03");
  assert.equal(suggestMatch("Na Piarsaigh.mp4", "Sun, 03 Aug 2031 18:00:00 GMT", "2026-10-17").playedOn, "2026-10-17");
  assert.equal(suggestMatch("Na Piarsaigh.mp4", null, "2026-10-17").playedOn, "2026-10-17");
});

test("an app's own noise in a name leaves no title, for the coach to fill in", () => {
  assert.equal(suggestMatch("recording_8f3a9c2e7b.mp4", null, "2026-10-17").title, "");
});

test("the four codes, and the ball each plays with", () => {
  assert.deepEqual([...GAME_CODES], ["hurling", "camogie", "football", "ladies_football"]);
  assert.equal(ballFor("hurling"), "sliotar");
  assert.equal(ballFor("camogie"), "sliotar");
  assert.equal(ballFor("football"), "football");
  assert.equal(ballFor("ladies_football"), "football");
  assert.equal(isGameCode("rounders"), false);
});
