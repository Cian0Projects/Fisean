/** Shapes shared between the review workspace and the pages that feed it. */
import type { Shape } from "@/lib/db/schema";
import { clipTagTone, type TagTone } from "@/lib/hurling/events";
import { toneColour } from "@/components/ui/TagMark";
import type { Markers } from "@/lib/hurling/notation";

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
  editedAt: number | null;
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
  /** The match's whistles, tapped on the line. They place line-logged stats on this video. */
  whistles?: Markers;
};

export type Viewer = {
  id: string;
  displayName: string;
  role: "admin" | "coach" | "player";
};

/** What a clip's tags say happened: its first tag that is an outcome. */
export function clipTone(clip: ClipRow, eventTypes: EventTypeRow[]): TagTone {
  return clipTagTone(
    clip.eventTypeIds.map((id) => eventTypes.find((e) => e.id === id)?.slug ?? ""),
  );
}

/**
 * Colour a clip's tick on a timeline by its outcome, so the strip reads as
 * the run of the game — and stays ink where nothing was won or lost.
 */
export function clipColour(clip: ClipRow, eventTypes: EventTypeRow[]): string {
  return toneColour(clipTone(clip, eventTypes));
}

export function eventLabelOf(e: EventTypeRow): string {
  return e.labelGa ?? e.labelEn;
}
