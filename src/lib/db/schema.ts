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
  PUCKOUT_SIDES,
  SHOT_RESULTS,
  STAT_OUTCOMES,
  STAT_TYPES,
} from "../hurling/stats";

const now = sql`(unixepoch() * 1000)`;
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/* ------------------------------------------------------------------ teams */

export const teams = sqliteTable("teams", {
  id: id(),
  name: text("name").notNull(),
  /** Short code players type once to join. Rotatable by an admin. */
  joinCode: text("join_code").notNull(),
  /** 35 for senior inter-county, 30 for most club and minor grades. */
  halfLengthMin: integer("half_length_min").notNull().default(30),
  createdAt: integer("created_at").notNull().default(now),
});

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
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ROLES }).notNull().default("player"),
    jerseyNumber: integer("jersey_number"),
    /** Position 1–15; see src/lib/hurling/positions.ts */
    position: integer("position"),
    createdAt: integer("created_at").notNull().default(now),
    lastSeenAt: integer("last_seen_at"),
  },
  (t) => [uniqueIndex("users_team_username").on(t.teamId, t.username)],
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
    /** Who it is credited to. Optional — a tally still counts without a name. */
    playerId: text("player_id").references(() => users.id, { onDelete: "set null" }),
    /** Where it happened, normalised 0–1 as everywhere else. */
    originX: real("origin_x"),
    originY: real("origin_y"),
    /** Deliveries only: where it landed. Drawn as an arrow, not a second dot. */
    destX: real("dest_x"),
    destY: real("dest_y"),
    /** Shots only. A cúl or a cúilín also feeds the scoreline. */
    shotResult: text("shot_result", { enum: SHOT_RESULTS }),
    /**
     * Positive turnovers only. "Turnover leading to a score" is a flag rather
     * than a stat type of its own — it is the same turnover described twice.
     */
    ledToScore: integer("led_to_score", { mode: "boolean" }),
    /** Poc amach only: whose it was. Who won it is `outcome`. */
    puckoutTakenBy: text("puckout_taken_by", { enum: PUCKOUT_SIDES }),
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
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [
    index("match_stats_match").on(t.matchId, t.createdAt),
    index("match_stats_team").on(t.teamId),
    index("match_stats_player").on(t.playerId),
    index("match_stats_video").on(t.videoId, t.atMs),
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
  player: one(users, { fields: [matchStats.playerId], references: [users.id] }),
  clip: one(clips, { fields: [matchStats.clipId], references: [clips.id] }),
  video: one(videos, { fields: [matchStats.videoId], references: [videos.id] }),
}));
