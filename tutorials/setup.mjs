/**
 * Builds the world the videos are recorded in: a throwaway database with the
 * demo squad, footage that really plays, and a session cookie for the
 * manager. Nothing here touches data/fisean.db or the real media folder.
 *
 *   node setup.mjs            (run from tutorials/, after `npm run build`)
 *
 * The squad is renamed to made-up names after seeding, because these videos
 * are public and the seed uses real people.
 */
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const WORK = process.env.TUTORIAL_WORK ?? resolve(import.meta.dirname, ".work");
const FOOTAGE = process.env.TUTORIAL_FOOTAGE ?? join(ROOT, "data/media/6615b7e3-297d-4a68-9f50-808894d47019/d45dbde7-cd28-475a-a125-920b0e848671.mp4");

rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, "media"), { recursive: true });
const env = {
  ...process.env,
  DATABASE_PATH: join(WORK, "tutorial.db"),
  MEDIA_DIR: join(WORK, "media"),
  MAIL_OUTBOX: join(WORK, "outbox"),
};
const run = (cmd) => execSync(cmd, { cwd: ROOT, env, stdio: "inherit" });

run("npm run db:migrate");
run("npm run seed");

const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");
const db = new Database(env.DATABASE_PATH);

// Made-up panel. Order matches the seed's squad, so jersey numbers line up.
const NAMES = [
  "Pádraig Walsh", "Seán Brennan", "Declan Murphy", "Colm Doyle", "Fionn Gallagher",
  "Oisín Keane", "Ruairí Lawlor", "Tadhg Nolan", "Cathal Byrne", "Eoghan Dunne",
  "Niall Redmond", "Liam Cassidy", "Darragh Fitz", "Aidan Hogan", "Rory Maher",
  "Cillian Egan", "Shane Tobin", "Eamon Quirke", "Jack Delaney", "Cormac Hanley",
  "Kevin Roche", "Mícheál Teahan", "Donal Sweeney", "Ian Brophy", "Ger Looby",
  "Paul Hickey", "Alan Cahill", "Enda Burke", "Barry Moran", "Tomás Ryan", "Dónal Fahey",
];
const squad = db.prepare("select id from users where role = 'player' order by rowid").all();
const rename = db.prepare("update users set display_name = ?, email = ? where id = ?");
squad.forEach((u, i) =>
  rename.run(NAMES[i], `${NAMES[i].toLowerCase().replace(/[^a-z]/g, "").slice(0, 12)}@demo.ardawn.test`, u.id),
);
db.prepare("update users set display_name = 'Mairéad Kelly' where role = 'admin'").run();
db.prepare("update teams set name = 'Naomh Colm', join_code = 'COLM42'").run();
// A new club waits for the host's check; the demo club has had it.
db.prepare("update clubs set name = 'Naomh Colm', approved_at = ?").run(Date.now());
db.prepare("update matches set opponent = 'Cill Ruadháin', venue = 'Páirc na Cluana', competition = 'County Senior Championship'").run();

// Footage that plays: put the real file where the seed's placeholder points,
// and shrink the video to its true length. The seeded clips sit an hour into
// a 62 minute game, past the end of this file, so they go.
const video = db.prepare("select id, storage_key from videos").get();
mkdirSync(join(env.MEDIA_DIR, video.storage_key, ".."), { recursive: true });
// The recording this footage came from has a TV scoreboard along the top and
// a desktop taskbar along the bottom: crop both out, and drop the commentary.
execSync(
  `ffmpeg -y -v error -i "${FOOTAGE}" -vf "crop=1884:924:0:84" -an -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart "${join(env.MEDIA_DIR, video.storage_key)}"`,
);
db.prepare("update videos set duration_ms = 20633, width = 1884, height = 924, fps = 30 where id = ?").run(video.id);
db.prepare("delete from video_markers").run();
db.prepare("delete from clips").run();

// A second match with nothing logged yet, for the live stat video, with
// 1 to 15 worn in the order of the squad as in the seeded match.
const first = db.prepare("select * from matches").get();
const live = crypto.randomUUID();
db.prepare(
  "insert into matches (id, team_id, opponent, competition, venue, played_on, home_away, half_length_min, created_by) values (?,?,?,?,?,?,?,?,?)",
).run(live, first.team_id, "Na Fianna", "League Division 1", "Páirc na Cluana", new Date().toISOString().slice(0, 10), "home", 30, first.created_by);
squad.slice(0, 15).forEach((u, i) =>
  db.prepare("insert into match_lineups (match_id, number, user_id) values (?,?,?)").run(live, i + 1, u.id),
);
writeFileSync(join(WORK, "ids.json"), JSON.stringify({ played: first.id, live, video: video.id }));

// A session for the manager, minted exactly as createSession does.
const manager = db.prepare("select id from users where role = 'admin'").get();
const expiresAt = Date.now() + 30 * 86_400_000;
const sid = crypto.randomUUID();
db.prepare("insert into sessions (id, user_id, expires_at, created_at) values (?, ?, ?, ?)").run(sid, manager.id, expiresAt, Date.now());
const { SignJWT } = await import(pathToFileURL(require.resolve("jose")).href);
const secret = process.env.SESSION_SECRET ?? readFileSync(join(ROOT, ".env.local"), "utf8").match(/^SESSION_SECRET=(.*)$/m)?.[1];
const token = await new SignJWT({ sid })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime(Math.floor(expiresAt / 1000))
  .sign(new TextEncoder().encode(secret));
writeFileSync(join(WORK, "session.txt"), token);
console.log("ready:", WORK);
