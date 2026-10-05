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
  matchLineups,
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

/**
 * The actual panel: a starting fifteen with their usual positions, then the
 * rest of the panel. No jersey numbers here — those belong to a match, so
 * the demo match below hands them out in this order, 1 to 31.
 */
const SQUAD = [
  ["Eddie Gibbons", 1],
  ["Darragh Geraghty", 2],
  ["David Lucey", 3],
  ["Ben Lynch", 4],
  ["Conal Ó Riain", 5],
  ["Mark Grogan", 6],
  ["Cian Ó Cathasaigh", 7],
  ["Brian Hayes", 8],
  ["Caolan Conway", 9],
  ["Fergal Whitely", 10],
  ["Ronan Hayes", 11],
  ["Finnian Donohoe", 12],
  ["Brendan Kenny", 13],
  ["Alex Considine", 14],
  ["Dara Purcell", 15],
  ["Ben Hynes", null],
  ["Tom Stakelum", null],
  ["Cormac Keys", null],
  ["Bill O'Carroll", null],
  ["Padhraic Linehan", null],
  ["Eoin Keys", null],
  ["Cian Mac Gabhann", null],
  ["Oisin O'Rorke", null],
  ["Ger Veale", null],
  ["Sean Purcell", null],
  ["Alex Hatt", null],
  ["Gearóid Flannery", null],
  ["Ciarán Donovan", null],
  ["Brian Sheehy", null],
  ["Seán Kinsella", null],
  ["Breandán Ó Conaill", null],
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
      SQUAD.map(([displayName, position]) => ({
        teamId: team.id,
        username: displayName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12),
        displayName,
        passwordHash: hash,
        role: "player" as const,
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

  // Who wore what that day. The stat sheet below is logged by these numbers.
  await db
    .insert(matchLineups)
    .values(squad.map((p, i) => ({ matchId: match.id, number: i + 1, userId: p.id })));

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
   * without anyone logging fifty entries by hand first. Every section of the
   * report gets something: both teams' shots (ours 2-8 from 18, theirs 1-5
   * from 10), poc amach by length, possession won and lost by kind, and frees
   * both ways — all split across the halves. Typed up a team at a time, as a
   * notebook often is, their shots close out each half and so show up in the
   * spells-without-reply table.
   */
  type H = 1 | 2;

  const statSheet = [
    // Tackles, where they were made; the front eight flagged.
    ...(
      [
        [0.22, 0.4, 2, false, 1],
        [0.18, 0.62, 3, false, 1],
        [0.3, 0.3, 5, false, 1],
        [0.35, 0.55, 6, false, 2],
        [0.28, 0.72, 7, false, 2],
        [0.52, 0.45, 8, true, 1],
        [0.62, 0.3, 11, true, 2],
        [0.7, 0.6, 13, true, 2],
        [0.25, 0.5, null, false, 2],
      ] as const
    ).map(([x, y, n, frontEight, half]) => ({
      statType: "tackle" as const,
      playerNumber: n,
      originX: x,
      originY: y,
      frontEight,
      half: half as H,
    })),

    // Deliveries: struck from inside our 65, aimed into the full forward line.
    ...(
      [
        [0.34, 0.3, 0.78, 0.4, "positive", 6, 14, 1],
        [0.41, 0.62, 0.8, 0.55, "positive", 7, 13, 1],
        [0.3, 0.5, 0.72, 0.28, "negative", 5, 15, 1],
        [0.45, 0.2, 0.83, 0.45, "positive", 9, 14, 1],
        [0.38, 0.75, 0.75, 0.7, "negative", 8, null, 2],
        [0.5, 0.45, 0.86, 0.5, "positive", 11, 14, 2],
        [0.28, 0.35, 0.68, 0.22, "negative", 6, 12, 2],
        [0.44, 0.55, 0.81, 0.6, "positive", 9, 15, 2],
      ] as const
    ).map(([ox, oy, dx, dy, outcome, n, target, half]) => ({
      statType: "delivery" as const,
      outcome,
      playerNumber: n,
      targetNumber: target,
      originX: ox,
      originY: oy,
      destX: dx,
      destY: dy,
      half: half as H,
    })),

    // Possessions won and lost, by how the ball changed hands.
    ...(
      [
        [0.55, 0.4, "positive", "turnover", 8, true, 1],
        [0.62, 0.65, "positive", "turnover", 10, true, 1],
        [0.48, 0.3, "positive", "sixty_forty", 6, false, 1],
        [0.4, 0.55, "positive", "sixty_plus", 5, false, 2],
        [0.5, 0.5, "positive", "other", 9, false, 2],
        [0.35, 0.45, "negative", "turnover", 12, false, 1],
        [0.58, 0.7, "negative", "sixty_forty", null, false, 2],
        [0.44, 0.2, "negative", "unforced", 10, false, 2],
      ] as const
    ).map(([x, y, outcome, possession, n, scored, half]) => ({
      statType: "turnover" as const,
      outcome,
      possession,
      playerNumber: n,
      originX: x,
      originY: y,
      ledToScore: outcome === "positive" ? scored : null,
      half: half as H,
    })),

    // Our shots: 2-8 from 18 — frees included, and what each came from.
    ...(
      [
        [0.88, 0.5, "goal", 14, "play", "turnover", 1],
        [0.84, 0.42, "goal", 13, "play", "puckout", 2],
        [0.79, 0.35, "point", 11, "play", "other", 1],
        [0.82, 0.6, "point", 12, "play", "puckout", 1],
        [0.76, 0.28, "point", 10, "play", "turnover", 1],
        [0.86, 0.55, "point", 14, "play", "other", 2],
        [0.73, 0.68, "point", 15, "play", "other", 2],
        [0.8, 0.48, "point", 11, "free", null, 1],
        [0.71, 0.3, "point", 11, "free", null, 2],
        [0.66, 0.5, "point", 11, "free", null, 2],
        [0.69, 0.22, "wide", 15, "play", "other", 1],
        [0.75, 0.8, "wide", 12, "play", "puckout", 1],
        [0.66, 0.5, "wide", 9, "play", "other", 2],
        [0.83, 0.18, "wide", 13, "play", "turnover", 2],
        [0.7, 0.75, "wide", 11, "free", null, 2],
        [0.9, 0.45, "saved", 14, "play", "other", 2],
        [0.87, 0.6, "lost", 13, "play", "puckout", 2],
        [0.85, 0.35, "sixty_five", 15, "play", "other", 1],
      ] as const
    ).map(([x, y, shotResult, n, shotKind, attemptSource, half]) => ({
      statType: "shot" as const,
      side: "us" as const,
      // The logger derives the outcome from the result rather than asking twice.
      outcome: (["goal", "point"].includes(shotResult)
        ? "positive"
        : ["retained", "sixty_five"].includes(shotResult)
          ? "unclear"
          : "negative") as "positive" | "negative" | "unclear",
      shotResult,
      shotKind,
      attemptSource,
      playerNumber: n,
      originX: x,
      originY: y,
      half: half as H,
    })),

    // Their shots, coloured from our side: their score is against us.
    ...(
      [
        [0.14, 0.45, "point", "play", 1],
        [0.2, 0.3, "wide", "play", 1],
        [0.24, 0.5, "point", "free", 1],
        [0.18, 0.7, "saved", "play", 1],
        [0.12, 0.52, "goal", "play", 2],
        [0.22, 0.4, "point", "play", 2],
        [0.28, 0.6, "wide", "play", 2],
        [0.3, 0.45, "point", "free", 2],
        [0.16, 0.35, "lost", "play", 2],
        [0.2, 0.55, "point", "play", 2],
      ] as const
    ).map(([x, y, shotResult, shotKind, half]) => ({
      statType: "shot" as const,
      side: "opposition" as const,
      outcome: (["goal", "point"].includes(shotResult) ? "negative" : "positive") as
        | "positive"
        | "negative",
      shotResult,
      shotKind,
      originX: x,
      originY: y,
      half: half as H,
    })),

    // Frees, both ways; the scorable ones given away in our own half.
    ...(
      [
        ["free_conceded", 0.18, 0.4, 3, true, 1],
        ["free_conceded", 0.24, 0.6, 6, true, 1],
        ["free_conceded", 0.12, 0.55, 2, true, 2],
        ["free_conceded", 0.55, 0.3, 9, false, 2],
        ["free_conceded", 0.22, 0.48, 4, true, 2],
        ["free_won", 0.8, 0.45, 14, null, 1],
        ["free_won", 0.72, 0.3, 11, null, 1],
        ["free_won", 0.66, 0.5, 13, null, 2],
      ] as const
    ).map(([statType, x, y, n, scorable, half]) => ({
      statType,
      playerNumber: n,
      originX: x,
      originY: y,
      scorable,
      half: half as H,
    })),

    // Poc amach, both ways, by length. Ours: two short ones held inside our
    // 65, which the report does not count as retained.
    ...(
      [
        ["us", "positive", "short", true, 0.3, 0.2, 5, 1],
        ["us", "positive", "short", true, 0.28, 0.75, 7, 1],
        ["us", "positive", "short", false, 0.2, 0.3, 2, 2],
        ["us", "positive", "short", false, 0.18, 0.7, 4, 2],
        ["us", "positive", "medium", null, 0.45, 0.45, 8, 1],
        ["us", "positive", "long", null, 0.56, 0.3, 9, 2],
        ["us", "negative", "long", null, 0.52, 0.6, null, 1],
        ["us", "negative", "medium", null, 0.42, 0.5, null, 2],
        ["us", "unclear", "long", null, 0.51, 0.38, null, 2],
        ["opposition", "positive", "long", null, 0.44, 0.55, 7, 1],
        ["opposition", "positive", "medium", null, 0.6, 0.35, 5, 2],
        ["opposition", "negative", "short", null, 0.8, 0.6, null, 1],
        ["opposition", "negative", "short", null, 0.82, 0.3, null, 2],
        ["opposition", "negative", "long", null, 0.42, 0.25, null, 2],
      ] as const
    ).map(([side, outcome, puckoutLength, pastSixtyFive, x, y, n, half]) => ({
      statType: "puckout" as const,
      puckoutTakenBy: side,
      outcome,
      puckoutLength,
      pastSixtyFive,
      // Only a won poc amach names anybody: it is the receiver.
      playerNumber: n,
      originX: x,
      originY: y,
      half: half as H,
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
    Or as a player:           ${squad[0].username.padEnd(12)} /  ${DEMO_PASSWORD}

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
