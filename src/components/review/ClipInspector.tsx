"use client";

/**
 * Detail panel for the selected clip: its title, the comments on it, who can
 * see it, and adding it to a playlist.
 *
 * A clip here is for talking about, not for counting. There are no event
 * tags and no stat logging on a clip: what it is goes in the title, in the
 * coach's own words, and the point goes in the comments. The stat sheet is
 * its own workflow beside this one.
 *
 * Every text field reports focus upward so the workspace can switch the
 * keyboard into text mode — otherwise typing "cúilín" into a comment would
 * fire the clip and comment shortcuts as you went.
 *
 * A comment is made where the playhead is: pause on the moment, write the
 * point, and perhaps draw on that frame first. Watching back, the clip stops
 * there to show it (src/lib/hurling/stops.ts). The comments and the drawing
 * in progress belong to the workspace, which needs them for the picture.
 */
import { useEffect, useState, useTransition } from "react";
import type { PlayerEngine } from "@/components/player/engine";
import { formatClock } from "@/lib/hurling/notation";
import { inPlayingOrder } from "@/lib/hurling/stops";
import { CommentItem } from "./CommentItem";
import { setClipAudience, updateClip } from "@/lib/actions/clips";
import { canShare, describeAudience, type Audience } from "@/lib/auth/visibility";
import { AudiencePicker } from "@/components/ui/AudiencePicker";
import { addComment } from "@/lib/actions/review";
import { listEditablePlaylists } from "@/lib/actions/reads";
import { addClipToPlaylist, createPlaylist } from "@/lib/actions/playlists";
import type { Shape } from "@/lib/db/schema";
import type { ClipRow, CommentRow, SquadMember, Viewer } from "./types";

/** A drawing made on one frame of this clip, waiting for its comment. */
export type DrawingDraft = { atMs: number; shapes: Shape[] };

type Props = {
  clip: ClipRow;
  squad: SquadMember[];
  viewer: Viewer;
  engine: PlayerEngine;
  /** Null while they load. */
  comments: CommentRow[] | null;
  onCommentsChange: (comments: CommentRow[]) => void;
  drawing: boolean;
  drawingDraft: DrawingDraft | null;
  onDraw: () => void;
  onDrawingPosted: () => void;
  onClipChange: (patch: Partial<ClipRow>) => void;
  onTextFocus: (focused: boolean) => void;
};

export function ClipInspector({
  clip,
  squad,
  viewer,
  engine,
  comments,
  onCommentsChange,
  drawing,
  drawingDraft,
  onDraw,
  onDrawingPosted,
  onClipChange,
  onTextFocus,
}: Props) {
  const [title, setTitle] = useState(clip.title);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([]);
  const [pending, startTransition] = useTransition();

  // No effect is needed to reset state when the clip changes: ReviewWorkspace
  // renders this keyed by clip id, so it remounts with fresh state from props.

  const drawn = drawingDraft?.shapes.length ?? 0;

  useEffect(() => {
    void listEditablePlaylists().then(setPlaylists);
  }, []);

  const saveTitle = () => {
    onTextFocus(false);
    if (title === clip.title) return;
    onClipChange({ title });
    startTransition(async () => {
      try {
        await updateClip(clip.id, { title });
      } catch {
        // Keep the edit visible; a reload shows the stored value.
      }
    });
  };

  // Saved on each tap: the panel has no save button to forget. The picker
  // already cleaned it the way the server will, so the reply is not applied;
  // a slow one would otherwise undo a quicker later tap.
  const setAudience = (audience: Audience) => {
    const before = clip.audience;
    onClipChange({ audience });
    startTransition(async () => {
      try {
        await setClipAudience(clip.id, audience);
      } catch {
        onClipChange({ audience: before });
      }
    });
  };

  const postComment = async () => {
    const body = draft.trim();
    const shapes = drawingDraft?.shapes ?? [];
    if ((!body && !shapes.length) || posting) return;
    // The drawing's frame if there is one, so the words land with it, even if
    // the playhead has moved since; otherwise wherever the playhead is.
    const atMs = drawingDraft?.atMs ?? Math.max(0, engine.snapshot.positionMs - clip.startMs);
    setPosting(true);
    setError(null);
    try {
      const posted = await addComment({ clipId: clip.id, body, atMs, shapes });
      onCommentsChange([...(comments ?? []), posted]);
      onClipChange({
        commentCount: clip.commentCount + 1,
        annotationCount: clip.annotationCount + (shapes.length ? 1 : 0),
      });
      setDraft("");
      onDrawingPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post that.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      className="flex max-h-[60%] min-h-0 shrink-0 flex-col border-t"
      style={{ borderColor: "var(--color-line)" }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3" style={{ background: "var(--color-surface-2)" }}>
        <div>
          <label className="label mb-1 block">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => onTextFocus(true)}
            onBlur={saveTitle}
            placeholder="What happens here?"
            className="field"
          />
          <div className="tabular mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            {formatClock(clip.startMs)} to {formatClock(clip.endMs)},{" "}
            {((clip.endMs - clip.startMs) / 1000).toFixed(1)} seconds, clipped by {clip.authorName}
          </div>
        </div>

        <section>
          <span className="label mb-1.5 block">Comments</span>
          {comments === null ? (
            <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              Loading…
            </div>
          ) : comments.length === 0 ? (
            <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              No comments yet.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {inPlayingOrder(comments).map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  viewer={viewer}
                  onSeek={(atMs) => {
                    engine.pause();
                    engine.seek(clip.startMs + atMs, { exact: true });
                  }}
                  onSaved={(u) => onCommentsChange(comments.map((x) => (x.id === u.id ? u : x)))}
                  onDeleted={(d) => {
                    const gone = comments.filter((x) => x.id === d.id || x.parentId === d.id);
                    onCommentsChange(comments.filter((x) => !gone.includes(x)));
                    onClipChange({
                      commentCount: Math.max(0, clip.commentCount - gone.length),
                      annotationCount: Math.max(0, clip.annotationCount - (d.shapes?.length ? 1 : 0)),
                    });
                  }}
                  onTextFocus={onTextFocus}
                />
              ))}
            </ul>
          )}

          <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
            <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              The clip will stop at{" "}
              <span className="tabular font-semibold" style={{ color: "var(--color-ash)" }}>
                {drawingDraft ? formatClock(drawingDraft.atMs) : <Moment engine={engine} startMs={clip.startMs} />}
              </span>{" "}
              to show this.
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => onTextFocus(true)}
              onBlur={() => onTextFocus(false)}
              placeholder={drawn ? "Say what the drawing shows…" : "Pause on the moment, then say what happened…"}
              rows={3}
              className="field resize-none"
            />
            {error && (
              <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                {error}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button onClick={onDraw} className="btn-ghost text-xs">
                {drawing
                  ? "Done drawing"
                  : drawn
                    ? `Drawing ready, ${drawn} mark${drawn === 1 ? "" : "s"}`
                    : "Draw on this frame"}
              </button>
              <button
                onClick={() => void postComment()}
                disabled={posting || (!draft.trim() && !drawn)}
                className="btn-primary text-xs"
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </section>

        <section>
          <span className="label mb-1.5 block">Who can see it</span>
          {canShare(viewer, clip) && !clip.pending ? (
            <AudiencePicker
              value={clip.audience}
              onChange={setAudience}
              people={squad}
              makerId={clip.createdBy}
              maker={clip.createdBy === viewer.id ? "you" : clip.authorName}
              compact
            />
          ) : (
            <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {describeAudience(
                clip.audience,
                (id) => (id === viewer.id ? "you" : squad.find((m) => m.id === id)?.displayName),
                clip.authorName,
              )}{" "}
              Only {clip.authorName} can change that.
            </p>
          )}
        </section>

        <section>
          <span className="label mb-1.5 block">Add to playlist</span>
          <div className="flex flex-wrap gap-1">
            {playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => startTransition(() => void addClipToPlaylist(p.id, clip.id))}
                className="btn-outline px-2 py-1 text-[12px]"
              >
                {p.title}
              </button>
            ))}
            <button
              onClick={() => {
                const name = window.prompt("New playlist name");
                if (!name?.trim()) return;
                startTransition(async () => {
                  const { id } = await createPlaylist({
                    title: name.trim(),
                    clipIds: [clip.id],
                    isOfficial: viewer.role !== "player",
                  });
                  setPlaylists((prev) => [...prev, { id, title: name.trim() }]);
                });
              }}
              className="btn-ghost px-2 py-1 text-[12px]"
            >
              + New
            </button>
          </div>
        </section>

        {pending && (
          <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Saving…
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Where in the clip the playhead is, to the second, so the moment a comment
 * will stop on is in front of whoever is writing it. Subscribes on its own,
 * rather than re-rendering the whole panel every frame.
 */
export function Moment({ engine, startMs }: { engine: PlayerEngine; startMs: number }) {
  const [label, setLabel] = useState(() => formatClock(Math.max(0, engine.snapshot.positionMs - startMs)));
  useEffect(
    () => engine.subscribe((t) => setLabel(formatClock(Math.max(0, t.positionMs - startMs)))),
    [engine, startMs],
  );
  return <>{label}</>;
}
