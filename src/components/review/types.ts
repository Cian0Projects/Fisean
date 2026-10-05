/** Shapes shared between the review workspace and the pages that feed it. */
import type { Shape } from "@/lib/db/schema";

export type EventTypeRow = {
  id: string;
  slug: string;
  labelEn: string;
  labelGa: string | null;
  category: string;
  colour: string;
  scoreValue: number;
  hotkey: string | null;
};

export type SquadMember = {
  id: string;
  displayName: string;
  position: number | null;
  role: "admin" | "coach" | "player";
};

export type ClipRow = {
  id: string;
  startMs: number;
  endMs: number;
  title: string;
  visibility: "team" | "private";
  createdBy: string | null;
  authorName: string;
  eventTypeIds: string[];
  playerIds: string[];
  commentCount: number;
  annotationCount: number;
  /** Set while an optimistically-created clip is still being saved. */
  pending?: boolean;
};

export type CommentRow = {
  id: string;
  body: string;
  atMs: number | null;
  parentId: string | null;
  createdAt: number;
  authorName: string;
  userId: string | null;
};

export type AnnotationRow = {
  id: string;
  atMs: number;
  durationMs: number;
  shapes: Shape[];
  authorName: string;
  userId: string | null;
};

export type VideoInfo = {
  id: string;
  src: string;
  durationMs: number;
  fps: number | null;
  width: number | null;
  height: number | null;
  codecWarning: string | null;
  originalFilename: string;
};

export type MatchInfo = {
  id: string | null;
  opponent: string;
  competition: string | null;
  playedOn: string;
  halfLengthMin: number;
};

export type Viewer = {
  id: string;
  displayName: string;
  role: "admin" | "coach" | "player";
};

/** Colour a clip by its first tag, so the timeline reads at a glance. */
export function clipColour(clip: ClipRow, eventTypes: EventTypeRow[]): string {
  const first = clip.eventTypeIds[0];
  return eventTypes.find((e) => e.id === first)?.colour ?? "var(--color-line-strong)";
}

export function eventLabelOf(e: EventTypeRow): string {
  return e.labelGa ?? e.labelEn;
}
