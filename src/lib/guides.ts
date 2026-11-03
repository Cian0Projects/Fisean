/**
 * The how-to videos, and who gets to watch which.
 *
 * They are recorded by the scripts in `tutorials/`, one per entry here, and
 * the slug is the same in both places. There are two kinds of file:
 *
 * - `open` videos sit in `public/guides/` and are served as plain files. They
 *   are the two a stranger needs before there is an account to sign in to:
 *   setting a club up and joining one. The landing page shows them.
 * - Everything else sits in `content/guides/`, which the web server cannot
 *   see, and is served by `/api/guides/[file]` to a signed-in member only.
 *   Nothing bills against a plan yet, so "behind the paywall" means behind
 *   the sign-in: when billing arrives, that route is the one place to add
 *   the check.
 *
 * Who a video is for is a convenience, not a lock: a player is not shown the
 * stat logging videos because the stat logger is not theirs to use, but the
 * route serves any signed-in member any of them.
 */

export type GuideRole = "player" | "coach" | "admin";

export type Guide = {
  slug: string;
  title: string;
  /** One sentence, shown under the title. Sentence case, no dashes. */
  blurb: string;
  /** Who it helps. `everyone` is every role; `coach` is coaches and admins. */
  audience: "everyone" | "coach" | "admin";
  /** True when a stranger may watch it: it is a plain file under public/. */
  open: boolean;
};

export const GUIDES: readonly Guide[] = [
  {
    slug: "set-up-your-club",
    title: "Set up your club",
    blurb: "Make your space on Ardawn in about a minute.",
    audience: "admin",
    open: true,
  },
  {
    slug: "join-your-panel",
    title: "Join your club as a player",
    blurb: "One team code from your manager, and you are in.",
    audience: "everyone",
    open: true,
  },
  {
    slug: "make-a-clip",
    title: "Clip a moment from the match",
    blurb: "Capture it, name it, trim it and share it with the panel.",
    audience: "everyone",
    open: false,
  },
  {
    slug: "log-stats-live",
    title: "Log stats during a match",
    blurb: "Tackles, shots and restarts from the line, by tap or by voice.",
    audience: "coach",
    open: false,
  },
  {
    slug: "after-the-match-stats",
    title: "After the match: share the stat sheet",
    blurb: "Name the numbers, submit, and the whole panel can read it.",
    audience: "coach",
    open: false,
  },
  {
    slug: "make-a-drill",
    title: "Draw a training drill",
    blurb: "Build a 3 v 2 step by step, then play it back.",
    audience: "coach",
    open: false,
  },
];

/** The videos that suit a role, in the order they are shown. */
export function guidesFor(role: GuideRole): Guide[] {
  return GUIDES.filter(
    (g) => g.audience === "everyone" || (g.audience === "coach" ? role !== "player" : role === "admin"),
  );
}

export function openGuides(): Guide[] {
  return GUIDES.filter((g) => g.open);
}

/** A guide's file name for one of its two files, the video or its poster. */
export function guideFile(slug: string, kind: "video" | "poster"): string {
  return `${slug}.${kind === "video" ? "mp4" : "jpg"}`;
}

/** Where the browser fetches a guide's video or poster. */
export function guideUrl(g: Guide, kind: "video" | "poster"): string {
  return `${g.open ? "/guides" : "/api/guides"}/${guideFile(g.slug, kind)}`;
}

/** The guide a requested file name belongs to, or null for anything else. */
export function guideForFile(file: string): { guide: Guide; kind: "video" | "poster" } | null {
  for (const guide of GUIDES) {
    if (file === guideFile(guide.slug, "video")) return { guide, kind: "video" };
    if (file === guideFile(guide.slug, "poster")) return { guide, kind: "poster" };
  }
  return null;
}
