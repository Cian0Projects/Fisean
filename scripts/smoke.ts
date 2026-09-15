/**
 * End-to-end smoke test against a running dev server.
 *
 *   npm run dev          (in one terminal)
 *   npm run smoke        (in another)
 *
 * Mints a real session cookie the same way the app does, then exercises the
 * authenticated pages and — the part that actually matters — checks that the
 * media route answers byte-range requests correctly. If Range serving is
 * broken, seeking a 90-minute file degrades to re-downloading it, so this is
 * worth asserting rather than eyeballing.
 */
import "./_env";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SignJWT } from "jose";
import { desc, eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { sessions, teams, users, videos } from "../src/lib/db/schema";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const [team] = await db.select().from(teams).orderBy(desc(teams.createdAt)).limit(1);
  if (!team) {
    console.error("No team found. Run `npm run seed` first.");
    process.exit(1);
  }

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.teamId, team.id))
    .orderBy(desc(users.createdAt))
    .limit(1);

  // Mint a session exactly as createSession does.
  const expiresAt = Date.now() + 3_600_000;
  const [session] = await db
    .insert(sessions)
    .values({ userId: admin.id, expiresAt })
    .returning();

  const token = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));

  const cookie = `fisean_session=${token}`;
  const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${BASE}${path}`, { headers: { cookie, ...headers }, redirect: "manual" });

  console.log(`\nSmoke test against ${BASE}\n`);

  console.log("Authenticated pages");
  const dash = await get("/");
  check("dashboard renders", dash.status === 200, `status ${dash.status}`);
  const dashHtml = await dash.text();
  check("dashboard shows the squad name", dashHtml.includes(team.name));

  for (const path of ["/playlists", "/admin"]) {
    const res = await get(path);
    check(`${path} renders`, res.status === 200, `status ${res.status}`);
  }

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.teamId, team.id))
    .orderBy(desc(videos.createdAt))
    .limit(1);

  if (video) {
    const res = await get(`/review/${video.id}`);
    check("review workspace renders", res.status === 200, `status ${res.status}`);
    const html = await res.text();
    check("tagging bar is present", html.includes("Quick clip"));
    check("hurling taxonomy reached the page", html.includes("Poc amach"));
    check("Irish score terms are used", html.includes("Cúilín") && html.includes("Cúl"));
  }

  // ---------------------------------------------------------------- ranges
  console.log("\nByte-range serving");
  const mediaDir = resolve(process.env.MEDIA_DIR ?? "./data/media");
  const key = `${team.id}/smoke-test.bin`;
  const path = join(mediaDir, key);
  const body = Buffer.alloc(10_000);
  for (let i = 0; i < body.length; i++) body[i] = i % 256;

  await mkdir(join(mediaDir, team.id), { recursive: true });
  await writeFile(path, body);

  try {
    const head = await get(`/api/media/${key}`, { Range: "" });
    check("advertises Accept-Ranges", head.headers.get("accept-ranges") === "bytes");

    const mid = await get(`/api/media/${key}`, { Range: "bytes=1000-1999" });
    check("ranged request answers 206", mid.status === 206, `status ${mid.status}`);
    check(
      "Content-Range is correct",
      mid.headers.get("content-range") === "bytes 1000-1999/10000",
      String(mid.headers.get("content-range")),
    );
    const midBytes = Buffer.from(await mid.arrayBuffer());
    check("returns exactly the requested length", midBytes.length === 1000, `${midBytes.length}`);
    check(
      "returns the right bytes",
      midBytes[0] === 1000 % 256 && midBytes[999] === 1999 % 256,
    );

    const suffix = await get(`/api/media/${key}`, { Range: "bytes=-500" });
    check(
      "suffix range works (Safari uses this to find a trailing moov)",
      suffix.headers.get("content-range") === "bytes 9500-9999/10000",
      String(suffix.headers.get("content-range")),
    );

    const open = await get(`/api/media/${key}`, { Range: "bytes=9990-" });
    check(
      "open-ended range runs to the last byte",
      open.headers.get("content-range") === "bytes 9990-9999/10000",
      String(open.headers.get("content-range")),
    );

    const bad = await get(`/api/media/${key}`, { Range: "bytes=50000-60000" });
    check("out-of-range answers 416", bad.status === 416, `status ${bad.status}`);

    const anon = await fetch(`${BASE}/api/media/${key}`, { redirect: "manual" });
    check("footage is refused without a session", anon.status === 401, `status ${anon.status}`);

    const traversal = await get("/api/media/../../package.json");
    check(
      "path traversal is refused",
      traversal.status >= 400,
      `status ${traversal.status}`,
    );
  } finally {
    await rm(path, { force: true });
    await db.delete(sessions).where(eq(sessions.id, session.id));
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

void main();
