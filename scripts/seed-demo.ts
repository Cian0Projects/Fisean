/**
 * Seed a demonstration squad, match, clips, playlists and comments.
 *
 *   npm run seed
 *
 * The point is to make the whole interface explorable without first finding
 * and copying a four-gigabyte match file. It registers a video row pointing
 * at whatever file you name (or a placeholder), so every screen has real data
 * behind it — clips on the timeline, a tagged scoreline, an assigned playlist
 * and a player whose own page has something on it.
 */
import "./_env";
import { desc, isNull } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import {
  clipPlayers,
  clipTags,
  clips,
  comments,
  eventTypes,
  matchStats,
  matches,
  playlistItems,
  playlistViewers,
  playlists,
  teams,
  users,
  videoMarkers,
  videos,
} from "../src/lib/db/schema";
import { generateJoinCode, hashPassword } from "../src/lib/auth/password";
import { HURLING_EVENTS } from "../src/lib/hurling/events";

const DEMO_PASSWORD = "hurling2026";

/** A believable starting fifteen. */
const SQUAD = [
  ["Eoin Murphy", 1, 1],
  ["Seán Ó Riain", 2, 2],
  ["Pádraig Walsh", 3, 3],
  ["Conor Delaney", 4, 4],
  ["Mikey Carey", 5, 5],
  ["Huw Lawlor", 6, 6],
  ["Tommy Walsh", 7, 7],
  ["Adrian Mullen", 8, 8],
  ["Conor Fogarty", 9, 9],
  ["Billy Ryan", 10, 10],
  ["TJ Reid", 11, 11],
  ["Martin Keoghan", 12, 12],
  ["Eoin Cody", 13, 13],
  ["Walter Walsh", 14, 14],
  ["Ciarán Ó Broin", 15, 15],
] as const;

/** Clips laid out across a 30-minute-half game, as a coach would tag it. */
const TAGGED = [
  [4 * 60_000, "poc_amach_won", "Poc amach won clean at midfield"],
  [6 * 60_000 + 20_000, "cuilin", "Point from the half forward line"],
  [9 * 60_000 + 40_000, "hook", "Hook in the corner, brilliant work"],
  [12 * 60_000, "turnover_conceded", "Caught in possession coming out"],
  [15 * 60_000 + 30_000, "cul", "Goal — pulled first time on the ground"],
  [19 * 60_000, "poc_amach_lost", "Poc amach lost short"],
  [22 * 60_000 + 10_000, "wide", "Shot dropped wide from the 65"],
  [26 * 60_000, "cuilin", "Sideline cut over the bar"],
  [34 * 60_000, "turnover_won", "Turnover won in the middle third"],
  [38 * 60_000 + 45_000, "cuilin", "Point from play off the left"],
  [43 * 60_000, "block", "Block down on the line"],
  [47 * 60_000 + 15_000, "free_won", "Free won under pressure"],
  [52 * 60_000, "cul", "Second goal, low to the corner"],
  [56 * 60_000 + 30_000, "cuilin", "Insurance point"],
] as const;

async function main() {
  const existing = await db.select().from(teams).limit(1);
  if (existing.length) {
    console.error(`
  There is already a team in this database.

  The demo seed is meant for an empty one. To start over, stop the app and
  delete data/fisean.db, then run this again.
`);
    process.exit(1);
  }

  // Taxonomy first — clips reference it.
  await db.insert(eventTypes).values(
    HURLING_EVENTS.map((e, i) => ({
      teamId: null,
      slug: e.slug,
      labelEn: e.labelEn,
      labelGa: e.labelGa ?? null,
      category: e.category,
      colour: e.colour,
      scoreValue: e.scoreValue ?? 0,
      hotkey: e.hotkey ?? null,
      sortOrder: i,
    })),
  );

  const joinCode = generateJoinCode();
  const [team] = await db
    .insert(teams)
    .values({ name: "Demo Hurling Club", joinCode, halfLengthMin: 30 })
    .returning();

  const hash = await hashPassword(DEMO_PASSWORD);

  const [manager] = await db
    .insert(users)
    .values({
      teamId: team.id,
      username: "bainisteoir",
      displayName: "Team Manager",
      passwordHash: hash,
      role: "admin",
    })
    .returning();

  const squad = await db
    .insert(users)
    .values(
      SQUAD.map(([displayName, jersey, position]) => ({
        teamId: team.id,
        username: displayName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12),
        displayName,
        passwordHash: hash,
        role: "player" as const,
        jerseyNumber: jersey,
        position,
      })),
    )
    .returning();

  const [match] = await db
    .insert(matches)
    .values({
      teamId: team.id,
      opponent: "Naomh Pádraig",
      competition: "County Senior Championship",
      venue: "Páirc an Chrócaigh",
      playedOn: new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10),
      homeAway: "home",
      halfLengthMin: 30,
      createdBy: manager.id,
    })
    .returning();

  // A placeholder media key: every screen works, and the video element simply
  // has nothing to play until a real file is registered with `npm run ingest`.
  const [video] = await db
    .insert(videos)
    .values({
      matchId: match.id,
      teamId: team.id,
      originalFilename: "demo-match.mp4",
      durationMs: 62 * 60_000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "avc1",
      status: "ready",
      storageKey: `${team.id}/demo-match.mp4`,
      sizeBytes: 0,
      uploadedBy: manager.id,
    })
    .returning();

  // Throw-in and the restart, so the timeline shows game clock.
  await db.insert(videoMarkers).values([
    { videoId: video.id, kind: "throw_in", atMs: 90_000 },
    { videoId: video.id, kind: "half_time", atMs: 31 * 60_000 },
    { videoId: video.id, kind: "second_half", atMs: 33 * 60_000 },
    { videoId: video.id, kind: "full_time", atMs: 62 * 60_000 },
  ]);

  const typeBySlug = new Map(
    (await db.select().from(eventTypes).where(isNull(eventTypes.teamId))).map((e) => [e.slug, e]),
  );

  const created: { id: string; slug: string }[] = [];
  for (const [at, slug, title] of TAGGED) {
    const [clip] = await db
      .insert(clips)
      .values({
        videoId: video.id,
        teamId: team.id,
        createdBy: manager.id,
        title,
        startMs: at - 8000,
        endMs: at + 3000,
        visibility: "team",
        pitchX: 0.55 + Math.random() * 0.4,
        pitchY: 0.2 + Math.random() * 0.6,
      })
      .returning();

    const type = typeBySlug.get(slug);
    if (type) await db.insert(clipTags).values({ clipId: clip.id, eventTypeId: type.id });

    // Put two players in each clip so the "your clips" page has content.
    const a = squad[Math.floor(Math.random() * squad.length)];
    const b = squad[Math.floor(Math.random() * squad.length)];
    const involved = a.id === b.id ? [a] : [a, b];
    await db.insert(clipPlayers).values(
      involved.map((p, i) => ({
        clipId: clip.id,
        userId: p.id,
        involvement: i === 0 ? ("primary" as const) : ("involved" as const),
      })),
    );

    created.push({ id: clip.id, slug });
  }

  await db.insert(comments).values([
    {
      clipId: created[4].id,
      userId: manager.id,
      body: "Look at the run off the shoulder here — that is the movement we want every time.",
      atMs: 4200,
    },
    {
      clipId: created[3].id,
      userId: manager.id,
      body: "Head up earlier. The ball was on outside us the whole way.",
      atMs: 2600,
    },
    {
      clipId: created[3].id,
      userId: squad[7].id,
      parentId: null,
      body: "Agreed, I had nobody showing inside me.",
    },
  ]);

  // An official playlist of the scores, assigned to the full panel.
  const scoreSlugs = new Set(["cul", "cuilin"]);
  const scoreClips = created.filter((c) => scoreSlugs.has(c.slug));

  const [scoresPlaylist] = await db
    .insert(playlists)
    .values({
      teamId: team.id,
      matchId: match.id,
      createdBy: manager.id,
      title: "Scores — Naomh Pádraig",
      description: "Every cúl and cúilín from the weekend.",
      isOfficial: true,
      visibility: "team",
    })
    .returning();

  await db
    .insert(playlistItems)
    .values(scoreClips.map((c, i) => ({ playlistId: scoresPlaylist.id, clipId: c.id, sortOrder: i })));

  await db
    .insert(playlistViewers)
    .values(squad.map((p) => ({ playlistId: scoresPlaylist.id, userId: p.id })));

  // A working-on-it playlist, assigned to the half back line only.
  const [workPlaylist] = await db
    .insert(playlists)
    .values({
      teamId: team.id,
      matchId: match.id,
      createdBy: manager.id,
      title: "Poc amach — where we lost it",
      description: "Watch before Tuesday. Focus on the second ball.",
      isOfficial: true,
      visibility: "assigned",
    })
    .returning();

  const restartClips = created.filter((c) => c.slug.startsWith("poc_amach"));
  await db
    .insert(playlistItems)
    .values(restartClips.map((c, i) => ({ playlistId: workPlaylist.id, clipId: c.id, sortOrder: i })));

  await db.insert(playlistViewers).values(
    squad
      .filter((p) => p.position !== null && p.position >= 5 && p.position <= 7)
      .map((p) => ({ playlistId: workPlaylist.id, userId: p.id })),
  );

  /**
   * A stat sheet for the same match.
   *
   * Deliberately not derived from the clips above — this is the notebook from
   * the line, typed up afterwards — so the report has something to show
   * without anyone logging fifty entries by hand first. It comes out at 2-7
   * from 14 shots, which is a respectable 64%.
   */
  const jersey = (n: number) => squad[n - 1].id;

  const statSheet = [
    // Tackles: a tally, mostly the backs, and one nobody caught the number of.
    ...[2, 3, 5, 6, 7, 8, 4].map((n) => ({
      statType: "tackle" as const,
      playerId: jersey(n),
    })),
    { statType: "tackle" as const },

    // Deliveries: struck from our half, into the full forward line.
    ...[
      [0.34, 0.3, 0.78, 0.4, "positive", 6],
      [0.41, 0.62, 0.8, 0.55, "positive", 7],
      [0.3, 0.5, 0.72, 0.28, "negative", 5],
      [0.45, 0.2, 0.83, 0.45, "positive", 9],
      [0.38, 0.75, 0.75, 0.7, "negative", 8],
      [0.5, 0.45, 0.86, 0.5, "positive", 11],
      [0.28, 0.35, 0.68, 0.22, "negative", 6],
      [0.44, 0.55, 0.81, 0.6, "positive", 9],
    ].map(([ox, oy, dx, dy, outcome, n]) => ({
      statType: "delivery" as const,
      outcome: outcome as "positive" | "negative",
      playerId: jersey(n as number),
      originX: ox as number,
      originY: oy as number,
      destX: dx as number,
      destY: dy as number,
    })),

    // Turnovers, two of which we scored from.
    ...[
      [0.55, 0.4, "positive", 8, true],
      [0.62, 0.65, "positive", 10, true],
      [0.48, 0.3, "positive", 6, false],
      [0.4, 0.55, "positive", 5, false],
      [0.35, 0.45, "negative", 12, false],
      [0.58, 0.7, "negative", 10, false],
    ].map(([x, y, outcome, n, scored]) => ({
      statType: "turnover" as const,
      outcome: outcome as "positive" | "negative",
      playerId: jersey(n as number),
      originX: x as number,
      originY: y as number,
      ledToScore: outcome === "positive" ? (scored as boolean) : null,
    })),

    // Fourteen shots: two cúil, seven cúilíní, five wides.
    ...[
      [0.88, 0.5, "goal", 14],
      [0.84, 0.42, "goal", 13],
      [0.79, 0.35, "point", 11],
      [0.82, 0.6, "point", 12],
      [0.76, 0.28, "point", 10],
      [0.86, 0.55, "point", 14],
      [0.73, 0.68, "point", 15],
      [0.8, 0.48, "point", 11],
      [0.71, 0.3, "point", 10],
      [0.69, 0.22, "wide", 15],
      [0.75, 0.8, "wide", 12],
      [0.66, 0.5, "wide", 9],
      [0.83, 0.18, "wide", 13],
      [0.7, 0.75, "wide", 15],
    ].map(([x, y, result, n]) => ({
      statType: "shot" as const,
      // A wide is the negative outcome, a score the positive one; the logger
      // derives this rather than asking twice.
      outcome: result === "wide" ? ("negative" as const) : ("positive" as const),
      shotResult: result as "goal" | "point" | "wide",
      playerId: jersey(n as number),
      originX: x as number,
      originY: y as number,
    })),

    // Frees conceded, all of them in our own half where they hurt.
    ...[
      [0.18, 0.4, 3],
      [0.24, 0.6, 6],
      [0.12, 0.55, 2],
      [0.3, 0.3, 5],
      [0.22, 0.48, 4],
    ].map(([x, y, n]) => ({
      statType: "free_conceded" as const,
      playerId: jersey(n as number),
      originX: x as number,
      originY: y as number,
    })),

    // Poc amach, both ways: ours five of seven, theirs two of five to us.
    ...[
      ["us", "positive", 0.52, 0.3, 8],
      ["us", "positive", 0.48, 0.65, 9],
      ["us", "positive", 0.56, 0.45, 6],
      ["us", "positive", 0.5, 0.2, 10],
      ["us", "positive", 0.54, 0.7, 8],
      ["us", "negative", 0.47, 0.5, null],
      ["us", "unclear", 0.51, 0.38, null],
      ["opposition", "positive", 0.44, 0.55, 7],
      ["opposition", "positive", 0.4, 0.35, 5],
      ["opposition", "negative", 0.46, 0.6, null],
      ["opposition", "negative", 0.38, 0.45, null],
      ["opposition", "negative", 0.42, 0.25, null],
    ].map(([side, outcome, x, y, n]) => ({
      statType: "puckout" as const,
      puckoutTakenBy: side as "us" | "opposition",
      outcome: outcome as "positive" | "negative" | "unclear",
      // Only a won poc amach names anybody: it is the receiver.
      playerId: n == null ? null : jersey(n as number),
      originX: x as number,
      originY: y as number,
    })),
  ];

  await db
    .insert(matchStats)
    .values(
      statSheet.map((s) => ({
        ...s,
        matchId: match.id,
        teamId: team.id,
        createdBy: manager.id,
      })),
    );

  const [latestVideo] = await db.select().from(videos).orderBy(desc(videos.createdAt)).limit(1);

  console.log(`
  Demo data seeded.

    Team        ${team.name}
    Join code   ${joinCode}

    Sign in as the manager:   bainisteoir  /  ${DEMO_PASSWORD}
    Or as a player:           tjreid       /  ${DEMO_PASSWORD}

    ${created.length} clips, 2 playlists, ${squad.length} players,
    and a full stat sheet for the match.

  Start the app with  npm run dev  and open  /review/${latestVideo.id}
  The stat report is at  /matches/${match.id}/stats

  The video row is a placeholder, so the player has nothing to play yet.
  To see it working with real footage:

    npm run ingest -- "path/to/any.mp4" --match ${match.id}
`);
  process.exit(0);
}

void main();
