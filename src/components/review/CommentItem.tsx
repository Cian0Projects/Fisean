"use client";

/**
 * One comment, shared by the clip panel and the playlist player. Only the
 * author sees Edit (the server enforces it too); an edited comment says so.
 * The author and the coaches see Delete, which takes the drawing with it.
 * Text focus is reported up so the keyboard shortcuts stand down while typing.
 *
 * The time is the moment playback stops on it; pressing it parks the player
 * there, which brings up the comment and its drawing over the picture.
 */
import { useState } from "react";
import { deleteComment, editComment } from "@/lib/actions/review";
import { formatClock } from "@/lib/hurling/notation";
import type { CommentRow, Viewer } from "./types";

export function CommentItem({
  comment,
  viewer,
  onSeek,
  onSaved,
  onDeleted,
  onTextFocus,
  underlineTime = false,
}: {
  comment: CommentRow;
  viewer: Pick<Viewer, "id" | "role">;
  onSeek: (atMs: number) => void;
  onSaved: (updated: CommentRow) => void;
  onDeleted: (comment: CommentRow) => void;
  onTextFocus: (focused: boolean) => void;
  underlineTime?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = comment.userId !== null && comment.userId === viewer.id;
  const canDelete = mine || viewer.role !== "player";
  const drawn = (comment.shapes?.length ?? 0) > 0;

  const remove = async () => {
    if (!window.confirm(drawn ? "Delete this comment and its drawing?" : "Delete this comment?")) return;
    try {
      await deleteComment(comment.id);
      onDeleted(comment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that.");
    }
  };

  const stop = () => {
    setEditing(false);
    setError(null);
    onTextFocus(false);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await editComment({ commentId: comment.id, body: draft });
      onSaved({ ...comment, body: saved.body, editedAt: saved.editedAt });
      stop();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="text-[13px]">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{comment.authorName}</span>
        {comment.parentId == null && (
          <button
            onClick={() => onSeek(comment.atMs ?? 0)}
            title="Go to this moment"
            className={`tabular text-[12px]${underlineTime ? " underline" : ""}`}
            style={{ color: "var(--color-ash)" }}
          >
            {formatClock(comment.atMs ?? 0)}
          </button>
        )}
        {drawn && (
          <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            with a drawing
          </span>
        )}
        {!editing && (
          <span className="ml-auto flex gap-3">
            {mine && (
              <button
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
                className="text-[12px]"
                style={{ color: "var(--color-ink-faint)" }}
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button onClick={() => void remove()} className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                Delete
              </button>
            )}
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-1 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => onTextFocus(true)}
            onBlur={() => onTextFocus(false)}
            rows={3}
            autoFocus
            className="field resize-none"
          />
          {error && (
            <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={stop} className="text-xs" style={{ color: "var(--color-ink-faint)" }}>
              Cancel
            </button>
            <button onClick={() => void save()} disabled={saving} className="btn-primary text-xs">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : comment.body ? (
        <p className="mt-0.5 whitespace-pre-wrap" style={{ color: "var(--color-ink-dim)" }}>
          {comment.body}
          {comment.editedAt != null && (
            <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {" "}
              (edited)
            </span>
          )}
        </p>
      ) : null}
      {!editing && error && (
        <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {error}
        </div>
      )}
    </li>
  );
}
