/**
 * Is this server ready for real clubs?
 *
 *   npm run preflight
 *
 * Run on the server, as the app's user, from the app's folder. It reads the
 * same .env the app does and checks the things that would hurt a club if they
 * were wrong and that nothing else would tell you about: footage going to the
 * server's own disk instead of R2, a bucket the browser cannot upload to, sign
 * in emails that never leave the box, and a database whose only copy is on
 * the one disk. Nothing it does changes anything a club can see; the R2 test
 * starts an upload and cancels it.
 *
 * Exits 1 when anything fails, so it can sit at the end of a deploy.
 */
import "./_env";
import { randomUUID } from "node:crypto";
import { readdir, stat, statfs } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { teamQuotaBytes } from "../src/lib/media/upload";
import { storageDriver, store } from "../src/lib/storage";

const DB_PATH = resolve(process.env.DATABASE_PATH ?? "./data/fisean.db");
const BACKUP_DIR = resolve(process.env.BACKUP_DIR ?? "./data/backups");
const DAY = 24 * 60 * 60 * 1000;

let failed = 0;
const ok = (label: string) => console.log(`  ok    ${label}`);
const warn = (label: string, fix: string) => console.log(`  warn  ${label}\n        ${fix}`);
const fail = (label: string, fix: string) => {
  failed++;
  console.log(`  FAIL  ${label}\n        ${fix}`);
};

function day(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * DAY).toISOString().slice(0, 10);
}

function checkSettings() {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32 || secret.startsWith("change-me")) {
    fail("SESSION_SECRET is missing or still the example", "Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  } else ok("SESSION_SECRET is set");

  const appUrl = process.env.APP_URL ?? "";
  if (!appUrl.startsWith("https://")) {
    fail("APP_URL is not an https address", "Every link in an email is built from it. Set APP_URL=https://ardawnsport.ie");
  } else ok(`APP_URL is ${appUrl}`);

  if (!process.env.ZEPTOMAIL_TOKEN || process.env.MAIL_DRIVER === "local") {
    fail("Email is going to the outbox, not to people", "Set ZEPTOMAIL_TOKEN and remove MAIL_DRIVER=local, or nobody outside the server can sign in.");
  } else ok("Email sends through ZeptoMail");

  if (!process.env.SIGNUP_CODE) {
    warn("No SIGNUP_CODE: anyone who finds /start can create a club", "Set SIGNUP_CODE while founding places are limited.");
  } else ok("New clubs need the sign-up code");

  const gb = teamQuotaBytes(process.env.TEAM_STORAGE_GB) / 1024 ** 3;
  ok(`Each club may store ${gb} GB, about ${Math.floor(gb / 3)} matches at 3 GB`);
}

async function checkStorage(): Promise<boolean> {
  if (storageDriver() !== "r2") {
    fail(
      "STORAGE_DRIVER is local: footage is going onto this server's disk",
      "Set STORAGE_DRIVER=r2 and the four R2_ settings (docs/DEPLOYMENT.md, step 1), then restart.",
    );
    return false;
  }
  ok("Footage goes to R2");

  if (process.env.R2_JURISDICTION?.trim().toLowerCase() !== "eu") {
    warn("The bucket is not set as EU", "Footage shows players, some of them minors. Use a bucket created under the EU jurisdiction and set R2_JURISDICTION=eu.");
  } else ok("The bucket is in the EU jurisdiction");

  // A real round trip with the real token: start an upload, then cancel it.
  const media = await store();
  const key = `preflight/${randomUUID()}.mp4`;
  let uploadId: string;
  try {
    uploadId = await media.createMultipart(key, "video/mp4");
    ok("R2 accepts the token and signing");
  } catch (err) {
    fail("R2 refused a test upload", err instanceof Error ? err.message : String(err));
    return false;
  }

  // Browsers upload straight to R2, so the bucket's CORS rule must let the
  // site's own address PUT parts. Ask the way a browser asks first.
  try {
    const origin = new URL(process.env.APP_URL || "https://ardawnsport.ie").origin;
    const res = await fetch(media.presignPart(key, uploadId, 1), {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "PUT" },
    });
    const allowed = res.headers.get("access-control-allow-origin");
    if (res.ok && (allowed === origin || allowed === "*")) ok(`The bucket lets ${origin} upload`);
    else fail(`The bucket's CORS rule does not let ${origin} upload`, "Add the CORS policy in docs/DEPLOYMENT.md, step 1. Without it every browser upload fails.");
  } catch (err) {
    warn("Could not test the bucket's CORS rule", err instanceof Error ? err.message : String(err));
  } finally {
    await media.abortMultipart(key, uploadId).catch(() => {});
  }
  return true;
}

async function checkBackups(inBucket: boolean) {
  const newest = await readdir(BACKUP_DIR)
    .then((names) => names.filter((n) => /^fisean-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort().at(-1))
    .catch(() => undefined);
  if (!newest) {
    fail(`No backups in ${BACKUP_DIR}`, "Run npm run backup, and check /etc/cron.daily/fisean-backup runs it (docs/DEPLOYMENT.md, Backups).");
  } else {
    const age = Date.now() - (await stat(join(BACKUP_DIR, newest))).mtimeMs;
    if (age > 2 * DAY) fail(`Newest backup is ${Math.floor(age / DAY)} days old (${newest})`, "The nightly backup has stopped. Check /etc/cron.daily/fisean-backup.");
    else ok(`Backed up on this server: ${newest}`);
  }

  if (!inBucket) {
    fail("No copy of the database off this server", "Footage in R2 also gives the backup somewhere to go. Until then, copy the backups off with rsync.");
    return;
  }
  // Same names as scripts/backup.ts.
  const media = await store();
  const found = (await media.stat(`backups/fisean-${day(0)}.db`)) ?? (await media.stat(`backups/fisean-${day(1)}.db`));
  if (!found) fail("No backup in the bucket from today or yesterday", "Run npm run backup and check it says \"Sent to the bucket\".");
  else ok("A copy of the database is in the bucket");
}

async function checkDisk() {
  const fs = await statfs(dirname(DB_PATH));
  const freeGb = (fs.bavail * fs.bsize) / 1024 ** 3;
  if (freeGb < 5) fail(`Only ${freeGb.toFixed(1)} GB free on the database's disk`, "Free space before the database or a backup cannot be written.");
  else ok(`${freeGb.toFixed(0)} GB free on the database's disk`);
}

async function main() {
  console.log("\n  Settings");
  checkSettings();
  console.log("\n  Footage");
  const inBucket = await checkStorage();
  console.log("\n  Backups");
  await checkBackups(inBucket);
  await checkDisk();
  console.log(failed ? `\n  ${failed} to fix before the first club.\n` : "\n  Ready for clubs.\n");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("  Preflight could not finish:", err instanceof Error ? err.message : err);
  process.exit(1);
});
