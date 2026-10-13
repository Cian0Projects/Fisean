/**
 * Register a match file with Físeán.
 *
 *   npm run ingest -- "C:\footage\ballygunner.mp4" --match <match id>
 *
 * Clubs upload in the browser, by dropping a file on the squad page. This is
 * for the host, when a file is already on the server and sending it through
 * a browser again would be pointless. It copies it into the media directory
 * (or registers it in place if it is already there) and reads its metadata
 * directly.
 */
import "./_env";
import { copyFile, mkdir, open, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { matches, teams, videos } from "../src/lib/db/schema";
import { codecWarning, probeFile } from "../src/lib/media/probe";
import { partBytes, planParts } from "../src/lib/media/upload";
import { contentTypeFor, storageDriver, store } from "../src/lib/storage";
import { formatClock } from "../src/lib/hurling/notation";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

/**
 * The same multipart upload the browser does, from the server's disk: start
 * it, PUT each part to its signed URL, finish it. One part at a time is fine
 * from a server with a fast link.
 */
async function sendToBucket(source: string, key: string, size: number): Promise<void> {
  const media = await store();
  const plan = planParts(size);
  const uploadId = await media.createMultipart(key, contentTypeFor(source));
  const file = await open(source, "r");
  try {
    for (let n = 1; n <= plan.count; n++) {
      const bytes = new Uint8Array(partBytes(n, plan, size));
      await file.read(bytes, 0, bytes.length, (n - 1) * plan.partSize);
      const res = await fetch(media.presignPart(key, uploadId, n), { method: "PUT", body: bytes });
      if (!res.ok) throw new Error(`Part ${n} was refused: ${res.status}`);
      process.stdout.write(`\r  ${Math.round((n / plan.count) * 100)}%`);
    }
    process.stdout.write("\n");
    await media.completeMultipart(key, uploadId, await media.listParts(key, uploadId));
  } catch (err) {
    await media.abortMultipart(key, uploadId).catch(() => {});
    throw err;
  } finally {
    await file.close();
  }
}

async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith("--")) {
    console.error(`
  Usage: npm run ingest -- <path to match file> [--match <match id>]

  The match id is optional; without it the footage is registered against the
  most recent match on the panel.
`);
    process.exit(1);
  }

  const source = resolve(input);
  const info = await stat(source).catch(() => null);
  if (!info?.isFile()) {
    console.error(`  Could not find a file at ${source}`);
    process.exit(1);
  }

  // With --match the club is whichever owns that match, so on a hosted
  // instance the host can load footage for any club. Without it, this is a
  // one-club install and the newest team is the only one.
  const matchId = arg("match");
  const [owner] = matchId
    ? await db
        .select({ teamId: matches.teamId })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1)
    : [];
  const [team] = owner
    ? await db.select().from(teams).where(eq(teams.id, owner.teamId)).limit(1)
    : await db.select().from(teams).orderBy(desc(teams.createdAt)).limit(1);
  if (!team) {
    console.error(
      matchId ? `  No match with id ${matchId}.` : "  No team yet. Run `npm run create-admin` first.",
    );
    process.exit(1);
  }

  const [match] = matchId
    ? await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
    : await db
        .select()
        .from(matches)
        .where(eq(matches.teamId, team.id))
        .orderBy(desc(matches.playedOn))
        .limit(1);

  if (!match) {
    console.error(
      "  No match to attach this to. Add one at /admin, or pass --match <id>.",
    );
    process.exit(1);
  }

  console.log(`\n  Reading ${basename(source)} (${(info.size / 1024 ** 3).toFixed(2)} GB)…`);
  const probe = await probeFile(source);

  if (!probe.durationMs) {
    console.warn(
      "  Could not read a duration from this file. It will still play, but the\n" +
        "  timeline will have no length until the browser reports one.",
    );
  }

  const mediaDir = resolve(process.env.MEDIA_DIR ?? "./data/media");
  const key = `${team.id}/${crypto.randomUUID()}${extname(source) || ".mp4"}`;
  const destination = join(mediaDir, key);
  const onR2 = storageDriver() === "r2";

  if (onR2) {
    console.log("  Sending to the R2 bucket…");
    await sendToBucket(source, key, info.size);
  } else if (source.startsWith(mediaDir)) {
    console.log("  Already inside the media directory — registering in place.");
  } else {
    await mkdir(join(mediaDir, team.id), { recursive: true });
    console.log("  Copying into the media directory…");
    await copyFile(source, destination);
  }

  const [video] = await db
    .insert(videos)
    .values({
      matchId: match.id,
      teamId: team.id,
      originalFilename: basename(source),
      durationMs: probe.durationMs,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      codec: probe.codec,
      moovAtStart: probe.moovAtStart,
      sizeBytes: info.size,
      // No transcode is needed: the browser seeks this file directly with
      // HTTP range requests, which is both faster and more accurate than
      // segmenting it would be.
      status: "ready",
      storageKey: !onR2 && source.startsWith(mediaDir)
        ? source.slice(mediaDir.length + 1).replace(/\\/g, "/")
        : key,
    })
    .returning();

  const warning = codecWarning(probe.codec);

  console.log(`
  Registered against ${match.opponent} (${match.playedOn}).

    Duration   ${formatClock(probe.durationMs)}
    Resolution ${probe.width ?? "?"}x${probe.height ?? "?"}${probe.fps ? ` @ ${probe.fps}fps` : ""}
    Codec      ${probe.codec ?? "unknown"}
    Index      ${probe.moovAtStart ? "at the start — opens immediately" : "at the end — first load takes a moment"}

  Review it at  /review/${video.id}
`);

  if (warning) console.warn(`  Heads up: ${warning}\n`);
  process.exit(0);
}

void main();
