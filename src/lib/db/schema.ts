/**
 * Físeán database schema.
 *
 * Design note: a clip is a row, not a video file. It stores an in/out point
 * against a source video, so creating one is an INSERT — no transcode, no
 * export queue, no waiting. One 90-minute match file backs hundreds of clips.
 */
import { sql, relations } from "drizzle-orm";
import {
  sqliteTable,
  blob,
  text,
  integer,
  real,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
// The stat vocabulary is domain data, kept beside the rest of the hurling
// logic so the logging form and the report can read it without pulling the
// ORM into the browser bundle. Imported relatively: drizzle-kit reads this
// file outside the Next.js path aliases.
import {
  ATTEMPT_SOURCES,
  POSSESSION_KINDS,
  PUCKOUT_LENGTHS,
  PUCKOUT_SIDES,
  SHOT_KINDS,
  SHOT_RESULTS,
  SIDES,
  STAT_OUTCOMES,
  STAT_TYPES,
  type Half,
} from "../hurling/stats";
import { GAME_CODES } from "../hurling/codes";
import { SOURCE_KINDS } from "../media/import";
import { NOTIFICATION_KINDS } from "../notify/digest";

const now = sql`(unixepoch() * 1000)`;
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/* ------------------------------------------------------------------ teams */

export const teams = sqliteTable(
  "teams",
  {
    id: id(),
    name: text("name").notNull(),
    /**
     * Short code players type once to join. Rotatable by an admin. Unique
     * because one hosted instance serves many clubs, and a shared code would
     * put a player on the wrong club's panel.
     */
    joinCode: text("join_code").notNull(),
    /**
     * Which of the four games this team plays; see src/lib/hurling/codes.ts.
     * Hurling for the clubs that signed up before the question was asked.
     */
    code: text("code", { enum: GAME_CODES }).notNull().default("hurling"),
    /** 35 for senior inter-county, 30 for most club and minor grades. */
    halfLengthMin: integer("half_length_min").notNull().default(30),
    /**
     * The club badge, a PNG of at most 256 pixels a side, scaled down in the
     * admin's browser (src/lib/media/badge.ts). Kept here rather than in R2:
     * it is a few tens of kilobytes, every page shows it, and in the database
     * it goes into the nightly backup with everything else about the club.
     */
    badge: blob("badge", { mode: "buffer" }),
    /** When the badge last changed. It versions the badge's URL, so browsers can cache it for good. */
    badgeUpdatedAt: integer("badge_updated_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("teams_join_code").on(t.joinCode)],
);

/* ------------------------------------------------------------------ users */

export const ROLES = ["admin", "coach", "player"] as const;
export type Role = (typeof ROLES)[number];

export const users = sqliteTable(
  "users",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /**
     * How someone signs in: a code sent here, never a password. Lower-cased
     * and trimmed before it is stored (src/lib/auth/email-code.ts). Null only
     * for accounts made before sign-in moved to email, until an admin or the
     * person themselves adds one.
     */
    email: text("email"),
    /** Left over from password sign-in; nothing new sets it. */
    username: text("username"),
    displayName: text("display_name").notNull(),
    /** Left over from password sign-in; nothing reads it any more. */
    passwordHash: text("password_hash"),
    /** Whether shares (new footage, playlists, clips you are in) are emailed. */
    emailNotifications: integer("email_notifications", { mode: "boolean" })
      .notNull()
      .default(true),
    role: text("role", { enum: ROLES }).notNull().default("player"),
    /**
     * Position 1–15, where they usually line out; see src/lib/hurling/positions.ts.
     * There is no jersey number here on purpose: numbers change game to game,
     * so they live on the match, in `match_lineups`.
     */
    position: integer("position"),
    createdAt: integer("created_at").notNull().default(now),
    lastSeenAt: integer("last_seen_at"),
  },
  // Unique across every club, not per club: signing in asks only for an
  // email, so one address on two panels would leave it guessing whose account
  // to open. SQLite lets any number of rows hold NULL under a unique index.
  (t) => [uniqueIndex("users_username").on(t.username), uniqueIndex("users_email").on(t.email)],
);

/**
 * One emailed sign-in: a 6-digit code to type and a link to tap, both for the
 * same request, both stored only as keyed hashes.
 *
 * The code exists because of the phone apps. A link in a mail app opens the
 * phone's browser, not the Capacitor shell, so the session would land in the
 * wrong place; a code typed into the app does not. The link exists because on
 * a laptop one click beats six digits.
 *
 * Joining a panel and setting up a club go through here too, with what the
 * form asked kept in `payload` until the address is proven. Nothing is
 * created for an email nobody has shown they read.
 */
export const SIGN_IN_PURPOSES = ["sign-in", "join", "start", "change-email"] as const;
export type SignInPurpose = (typeof SIGN_IN_PURPOSES)[number];

export const signInRequests = sqliteTable(
  "sign_in_requests",
  {
    /** Public: it rides in the code page's URL. The secrets are the code and link key. */
    id: id(),
    email: text("email").notNull(),
    purpose: text("purpose", { enum: SIGN_IN_PURPOSES }).notNull(),
    /** JSON of what the join, start or change-email form asked; see email-sign-in.ts. */
    payload: text("payload"),
    /** Where to land afterwards, already checked to be a local path. */
    next: text("next"),
    codeHash: text("code_hash").notNull(),
    linkHash: text("link_hash").notNull(),
    /** Wrong codes typed. Five and the request is dead, so six digits cannot be walked. */
    attempts: integer("attempts").notNull().default(0),
    /** For rate limiting by address as well as by email. */
    ip: text("ip"),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("sign_in_requests_email").on(t.email, t.createdAt),
    index("sign_in_requests_ip").on(t.ip, t.createdAt),
  ],
);

/** Kept as a table rather than a stateless JWT so an admin can revoke a session. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/* ---------------------------------------------------------------- matches */

export const matches = sqliteTable(
  "matches",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    opponent: text("opponent").notNull(),
    competition: text("competition"),
    venue: text("venue"),
    /** ISO date, e.g. "2026-09-13". */
    playedOn: text("played_on").notNull(),
    homeAway: text("home_away", { enum: ["home", "away", "neutral"] })
      .notNull()
      .default("home"),
    halfLengthMin: integer("half_length_min").notNull().default(30),
    notes: text("notes"),
    /**
     * The match's own whistles, as real-world times (ms since the epoch, by
     * the server's clock). Tapped by whoever keeps time on the line, so stats
     * logged on several phones with no footage can all be put on one game
     * clock. Footage keeps its own markers in `video_markers`, because a file
     * position and a time of day are different clocks.
     */
    throwInAt: integer("throw_in_at"),
    halfTimeAt: integer("half_time_at"),
    secondHalfAt: integer("second_half_at"),
    fullTimeAt: integer("full_time_at"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("matches_team_date").on(t.teamId, t.playedOn)],
);

/* ----------------------------------------------------------------- videos */

export const VIDEO_STATUS = [
  "uploading",
  "queued",
  "processing",
  "ready",
  "failed",
] as const;

export type SpriteMeta = {
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
  count: number;
  intervalMs: number;
};

export const videos = sqliteTable(
  "videos",
  {
    id: id(),
    matchId: text("match_id").references(() => matches.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    originalFilename: text("original_filename").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    /** Frames per second, so `,` and `.` step by real frames. */
    fps: real("fps"),
    /**
     * Video codec fourcc, e.g. "avc1" or "hvc1". Worth storing: iPhones
     * record HEVC by default and Chrome on Windows needs hardware support to
     * decode it, so a file that plays for the coach can be a black screen for
     * half the panel. We warn at ingest rather than on a Tuesday night.
     */
    codec: text("codec"),
    /** False when `moov` trails `mdat`, which slows the first load. */
    moovAtStart: integer("moov_at_start", { mode: "boolean" }).notNull().default(true),
    status: text("status", { enum: VIDEO_STATUS }).notNull().default("uploading"),
    /** Storage key of the source file, resolved by the storage adapter. */
    storageKey: text("storage_key").notNull(),
    /**
     * The store's multipart upload id while the file is on its way up, so a
     * dropped upload can be resumed. Cleared once the file is complete.
     */
    uploadId: text("upload_id"),
    /** Populated only when ffmpeg is available. */
    hlsKey: text("hls_key"),
    proxyKey: text("proxy_key"),
    spriteKey: text("sprite_key"),
    /** Geometry of the timeline filmstrip sprite sheet. */
    spriteMeta: text("sprite_meta", { mode: "json" }).$type<SpriteMeta | null>(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("videos_team").on(t.teamId), index("videos_match").on(t.matchId)],
);

/**
 * A match file the server is fetching from another app, for a club bringing
 * its old footage across (src/lib/media/import.ts). The video row exists from
 * the start, as an upload in progress, so the match shows up at once and the
 * file counts against the club's allowance; this row holds what only the
 * fetch needs. It is deleted when the file is in, taking the link with it:
 * download links carry their own access, so none is kept longer than needed.
 */
export const footageImports = sqliteTable(
  "footage_imports",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    /** Where to fetch from, after any share link was turned into a download link. */
    sourceUrl: text("source_url").notNull(),
    source: text("source", { enum: SOURCE_KINDS }).notNull().default("other"),
    /** Whether the source answers byte ranges; without them the file is read start to end. */
    ranges: integer("ranges", { mode: "boolean" }).notNull().default(true),
    receivedBytes: integer("received_bytes").notNull().default(0),
    /** Why it stopped, in words for the coach. Null while it is going. */
    error: text("error"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("footage_imports_team").on(t.teamId), uniqueIndex("footage_imports_video").on(t.videoId)],
);

/**
 * Throw-in / half-time markers. Set these once and every timestamp in the UI
 * can be shown as game time ("2nd half 18:42") instead of file position.
 * Coaches think in game clock, so this small table buys a lot of clarity.
 */
export const MARKER_KINDS = [
  "throw_in",
  "half_time",
  "second_half",
  "full_time",
] as const;

export const videoMarkers = sqliteTable(
  "video_markers",
  {
    id: id(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: MARKER_KINDS }).notNull(),
    atMs: integer("at_ms").notNull(),
  },
  (t) => [uniqueIndex("video_markers_unique").on(t.videoId, t.kind)],
);

/* ------------------------------------------------------------ event types */

/**
 * The hurling taxonomy lives in the database, not in component code, so a
 * team can add the events they actually track without a migration.
 * team_id NULL marks the built-in set seeded from src/lib/hurling/events.ts.
 */
export const eventTypes = sqliteTable(
  "event_types",
  {
    id: id(),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    labelEn: text("label_en").notNull(),
    /** Irish label where the Irish term is the one people actually use. */
    labelGa: text("label_ga"),
    category: text("category").notNull(),
    colour: text("colour").notNull().default("#64748b"),
    /** cúl = 3, cúilín = 1, everything else 0. Scorelines derive from tags. */
    scoreValue: integer("score_value").notNull().default(0),
    /** Number-key binding in the review workspace. Data, so it is remappable. */
    hotkey: text("hotkey"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("event_types_scope_slug").on(t.teamId, t.slug)],
);

/* ------------------------------------------------------------------ clips */

export const clips = sqliteTable(
  "clips",
  {
    id: id(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull().default(""),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    /** "team" is visible to the squad; "private" is self-review only. */
    visibility: text("visibility", { enum: ["team", "private"] })
      .notNull()
      .default("team"),
    /** Where on the pitch it happened, normalised 0–1. Drives shot maps. */
    pitchX: real("pitch_x"),
    pitchY: real("pitch_y"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [
    index("clips_video_start").on(t.videoId, t.startMs),
    index("clips_team").on(t.teamId),
    index("clips_creator").on(t.createdBy),
  ],
);

export const clipTags = sqliteTable(
  "clip_tags",
  {
    clipId: text("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.clipId, t.eventTypeId] }),
    index("clip_tags_event").on(t.eventTypeId),
  ],
);

/** Who is in the clip. This is what powers "your 6 clips from Sunday". */
export const clipPlayers = sqliteTable(
  "clip_players",
  {
    clipId: text("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    involvement: text("involvement", { enum: ["primary", "involved"] })
      .notNull()
      .default("involved"),
  },
  (t) => [
    primaryKey({ columns: [t.clipId, t.userId] }),
    index("clip_players_user").on(t.userId),
  ],
);

/* -------------------------------------------------------------- playlists */

export const playlists = sqliteTable(
  "playlists",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    matchId: text("match_id").references(() => matches.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Coach-published playlists sort above personal ones. */
    isOfficial: integer("is_official", { mode: "boolean" }).notNull().default(false),
    visibility: text("visibility", { enum: ["team", "private", "assigned"] })
      .notNull()
      .default("team"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("playlists_team").on(t.teamId)],
);

export const playlistItems = sqliteTable(
  "playlist_items",
  {
    id: id(),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    clipId: text("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    note: text("note"),
  },
  (t) => [index("playlist_items_order").on(t.playlistId, t.sortOrder)],
);

/** Assignment plus view tracking, so a selector can see who has watched. */
export const playlistViewers = sqliteTable(
  "playlist_viewers",
  {
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedAt: integer("assigned_at").notNull().default(now),
    firstViewedAt: integer("first_viewed_at"),
    viewedAt: integer("viewed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.playlistId, t.userId] }),
    index("playlist_viewers_user").on(t.userId),
  ],
);

/* --------------------------------------------------- comments, annotations */

export const comments = sqliteTable(
  "comments",
  {
    id: id(),
    clipId: text("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** One level of threading; replies point at a top-level comment. */
    parentId: text("parent_id"),
    body: text("body").notNull(),
    /** Optional offset within the clip, so a comment can pin to a moment. */
    atMs: integer("at_ms"),
    createdAt: integer("created_at").notNull().default(now),
    editedAt: integer("edited_at"),
  },
  (t) => [index("comments_clip").on(t.clipId, t.createdAt)],
);

/**
 * Drawings over the video. Shapes are stored in normalised 0–1 coordinates so
 * they scale to any player size, and are never burned into the video file.
 */
export type Shape =
  | {
      type: "arrow";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      colour: string;
      width: number;
    }
  | {
      type: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      colour: string;
      width: number;
    }
  | {
      type: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      colour: string;
      width: number;
    }
  | { type: "rect"; x: number; y: number; w: number; h: number; colour: string; width: number }
  | { type: "freehand"; points: [number, number][]; colour: string; width: number }
  | { type: "spotlight"; cx: number; cy: number; r: number; colour: string }
  | { type: "text"; x: number; y: number; body: string; colour: string; size: number };

export const annotations = sqliteTable(
  "annotations",
  {
    id: id(),
    clipId: text("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Offset from the clip's start, not absolute video position. */
    atMs: integer("at_ms").notNull(),
    durationMs: integer("duration_ms").notNull().default(3000),
    shapes: text("shapes", { mode: "json" }).$type<Shape[]>().notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("annotations_clip").on(t.clipId, t.atMs)],
);

/* ------------------------------------------------------------ match stats */

/**
 * The post-match stat sheet.
 *
 * Not the clip/tag system: a coach fills this in from the notebook after the
 * game, so the numbers stand on their own and a match nobody filmed still has
 * a stat sheet. Where a clip happens to cover the moment, `clipId` points at
 * it — optional, and never the other way round.
 *
 * One table rather than six, because every stat shares the same spine (match,
 * team, player, a point or two on the pitch) and the report reads them
 * together. The vocabulary and the rules that go with it live in
 * src/lib/hurling/stats.ts, which the column enums import, so the database,
 * the logging form and the report cannot disagree about what a stat is.
 */
export const matchStats = sqliteTable(
  "match_stats",
  {
    id: id(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    statType: text("stat_type", { enum: STAT_TYPES }).notNull(),
    /** Always relative to us. Null for a tackle or a free conceded. */
    outcome: text("outcome", { enum: STAT_OUTCOMES }),
    /**
     * Who it is credited to, as the jersey number the logger saw — not a
     * player. The name comes from this match's `match_lineups` when the sheet
     * is read, so a number jotted down on the line can be put to a name
     * afterwards, and every entry against it follows. Optional: a tally still
     * counts without one.
     */
    playerNumber: integer("player_number"),
    /** Deliveries only: the number it was aimed at, whether they won it or lost it. */
    targetNumber: integer("target_number"),
    /** Where it happened, normalised 0–1 as everywhere else. */
    originX: real("origin_x"),
    originY: real("origin_y"),
    /** Deliveries only: where it landed. Drawn as an arrow, not a second dot. */
    destX: real("dest_x"),
    destY: real("dest_y"),
    /**
     * The half the coach said it was in. An entry logged against footage with
     * the halves marked has its half worked out from the video instead, when
     * the report is read — see `statTiming`.
     */
    half: integer("half").$type<Half>(),
    /** Shots only: whose attempt. Null on rows from before both teams were logged, all ours. */
    side: text("side", { enum: SIDES }),
    /** Shots only. A cúl or a cúilín also feeds the scoreline. */
    shotResult: text("shot_result", { enum: SHOT_RESULTS }),
    /** Shots only: from play, or a free or 65. */
    shotKind: text("shot_kind", { enum: SHOT_KINDS }),
    /** Shots only, optional: what the attempt came from. */
    attemptSource: text("attempt_source", { enum: ATTEMPT_SOURCES }),
    /**
     * Positive turnovers only. "Turnover leading to a score" is a flag rather
     * than a stat type of its own — it is the same turnover described twice.
     */
    ledToScore: integer("led_to_score", { mode: "boolean" }),
    /** Turnovers only: how the ball changed hands. */
    possession: text("possession", { enum: POSSESSION_KINDS }),
    /** Tackles only: made by one of the six forwards or two midfielders. */
    frontEight: integer("front_eight", { mode: "boolean" }),
    /** Frees conceded only: within their free-taker's range. */
    scorable: integer("scorable", { mode: "boolean" }),
    /** Poc amach only: whose it was. Who won it is `outcome`. */
    puckoutTakenBy: text("puckout_taken_by", { enum: PUCKOUT_SIDES }),
    /** Poc amach only, optional: short, mid or long. */
    puckoutLength: text("puckout_length", { enum: PUCKOUT_LENGTHS }),
    /** Our short poc amach that we won only: was it worked out past our 65. */
    pastSixtyFive: integer("past_sixty_five", { mode: "boolean" }),
    /** The clip covering this moment, when one already exists. */
    clipId: text("clip_id").references(() => clips.id, { onDelete: "set null" }),
    /**
     * The video this was logged against, live, and its timestamp within that
     * file. Set automatically by the logging pad in the review workspace, off
     * the transport's own clock — never typed. Null for anything logged from
     * the standalone stat sheet, where there is no video open to read a time
     * from.
     */
    videoId: text("video_id").references(() => videos.id, { onDelete: "set null" }),
    atMs: integer("at_ms"),
    /**
     * When it happened, as a real-world time by the server's clock: stamped
     * the moment the coach started the entry (opened the mic, picked the
     * type, placed it), not when they pressed log. Read against the match's
     * whistles it gives the game clock, worked out when the sheet is read, so
     * a throw-in tapped late or corrected afterwards moves every entry.
     */
    seenAt: integer("seen_at"),
    /**
     * The words the speech engine wrote, when the entry was said rather than
     * tapped. Text only, never audio. Kept beside what was finally logged so
     * the engine's mishearings ("bookhouse" for puck out) can be read off
     * real matches and taught to the parser; nothing in the app shows it.
     */
    voiceHeard: text("voice_heard"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [
    index("match_stats_match").on(t.matchId, t.createdAt),
    index("match_stats_team").on(t.teamId),
    index("match_stats_video").on(t.videoId, t.atMs),
  ],
);

/**
 * Who wore which number in one match.
 *
 * Numbers belong to the match, not the player: a panel reshuffles week to
 * week, and a sub can wear 22 one day and 9 the next. The stat sheet is
 * logged by number, so this is what puts names to it. A number with no row
 * here is simply not assigned yet — its entries still count.
 */
export const matchLineups = sqliteTable(
  "match_lineups",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.number] }),
    // One number each: a player is not two people in the same match.
    uniqueIndex("match_lineups_player").on(t.matchId, t.userId),
  ],
);

/* ----------------------------------------------------------------- drills */

/**
 * A training drill, animated on a pitch; see src/lib/hurling/drill.ts.
 *
 * The pieces and steps are one JSON column rather than tables of their own.
 * A drill is always loaded and saved whole by its editor, and nothing ever
 * asks "which drills have a player at the 65" — so rows per position would
 * be joins with no question to answer. `parseDrill` validates it both ways.
 */
export const drills = sqliteTable(
  "drills",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    /** The coaching points: what the drill is for, and what to look for. */
    notes: text("notes").notNull().default(""),
    /** A serialised `DrillData`. */
    data: text("data").notNull(),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [index("drills_team").on(t.teamId, t.updatedAt)],
);

/* ---------------------------------------------------------- notifications */

/**
 * Something shared with one person, waiting to be emailed.
 *
 * Written in the same request as the share and sent later, a few at a time,
 * by src/lib/notify/sender.ts. That is what lets fifteen clips tagged after
 * training arrive as one email rather than fifteen, and a failed send be
 * retried rather than lost. The unique index makes re-sharing the same thing
 * a no-op, so reassigning a playlist does not email twice.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    /** The video, playlist or clip it is about. Not a foreign key: it points at three tables. */
    subjectId: text("subject_id").notNull(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(now),
    /** Set once emailed, or once skipped because there is nowhere to send it. */
    sentAt: integer("sent_at"),
  },
  (t) => [
    uniqueIndex("notifications_once").on(t.userId, t.kind, t.subjectId),
    index("notifications_pending").on(t.sentAt, t.userId),
  ],
);

/* -------------------------------------------------------------- relations */

export const teamsRel = relations(teams, ({ many }) => ({
  users: many(users),
  matches: many(matches),
  videos: many(videos),
}));

export const usersRel = relations(users, ({ one, many }) => ({
  team: one(teams, { fields: [users.teamId], references: [teams.id] }),
  clips: many(clips),
}));

export const matchesRel = relations(matches, ({ one, many }) => ({
  team: one(teams, { fields: [matches.teamId], references: [teams.id] }),
  videos: many(videos),
}));

export const videosRel = relations(videos, ({ one, many }) => ({
  match: one(matches, { fields: [videos.matchId], references: [matches.id] }),
  clips: many(clips),
  markers: many(videoMarkers),
}));

export const videoMarkersRel = relations(videoMarkers, ({ one }) => ({
  video: one(videos, { fields: [videoMarkers.videoId], references: [videos.id] }),
}));

export const clipsRel = relations(clips, ({ one, many }) => ({
  video: one(videos, { fields: [clips.videoId], references: [videos.id] }),
  author: one(users, { fields: [clips.createdBy], references: [users.id] }),
  tags: many(clipTags),
  players: many(clipPlayers),
  comments: many(comments),
  annotations: many(annotations),
}));

export const playlistsRel = relations(playlists, ({ one, many }) => ({
  team: one(teams, { fields: [playlists.teamId], references: [teams.id] }),
  match: one(matches, { fields: [playlists.matchId], references: [matches.id] }),
  items: many(playlistItems),
  viewers: many(playlistViewers),
}));

export const playlistItemsRel = relations(playlistItems, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistItems.playlistId],
    references: [playlists.id],
  }),
  clip: one(clips, { fields: [playlistItems.clipId], references: [clips.id] }),
}));

export const playlistViewersRel = relations(playlistViewers, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistViewers.playlistId],
    references: [playlists.id],
  }),
  user: one(users, { fields: [playlistViewers.userId], references: [users.id] }),
}));

export const clipTagsRel = relations(clipTags, ({ one }) => ({
  clip: one(clips, { fields: [clipTags.clipId], references: [clips.id] }),
  eventType: one(eventTypes, {
    fields: [clipTags.eventTypeId],
    references: [eventTypes.id],
  }),
}));

export const clipPlayersRel = relations(clipPlayers, ({ one }) => ({
  clip: one(clips, { fields: [clipPlayers.clipId], references: [clips.id] }),
  user: one(users, { fields: [clipPlayers.userId], references: [users.id] }),
}));

export const commentsRel = relations(comments, ({ one }) => ({
  clip: one(clips, { fields: [comments.clipId], references: [clips.id] }),
  user: one(users, { fields: [comments.userId], references: [users.id] }),
}));

export const annotationsRel = relations(annotations, ({ one }) => ({
  clip: one(clips, { fields: [annotations.clipId], references: [clips.id] }),
  user: one(users, { fields: [annotations.userId], references: [users.id] }),
}));

export const matchStatsRel = relations(matchStats, ({ one }) => ({
  match: one(matches, { fields: [matchStats.matchId], references: [matches.id] }),
  team: one(teams, { fields: [matchStats.teamId], references: [teams.id] }),
  clip: one(clips, { fields: [matchStats.clipId], references: [clips.id] }),
  video: one(videos, { fields: [matchStats.videoId], references: [videos.id] }),
}));
