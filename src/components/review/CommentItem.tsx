"use client";

/**
 * One comment, shared by the clip panel and the playlist player. Only the
 * author sees Edit (the server enforces it too); an edited comment says so.
 * Text focus is reported up so the keyboard shortcuts stand down while typing.
 */
import { useState } from "react";
import { editComment } from "@/lib/actions/review";
import { formatClock } from "@/lib/hurling/notation";
import type { CommentRow } from "./types";

export function CommentItem({
  comment,
  viewerId,
  onSeek,
  onSaved,
  onTextFocus,
  underlineTime = false,
}: {
  comment: CommentRow;
  viewerId: string;
  onSeek: (atMs: number) => void;
  onSaved: (updated: CommentRow) => void;
  onTextFocus: (focused: boolean) => void;
  underlineTime?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = comment.userId !== null && comment.userId === viewerId;

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
        {comment.atMs != null && (
          <button
            onClick={() => onSeek(comment.atMs!)}
            className={`tabular text-[12px]${underlineTime ? " underline" : ""}`}
            style={{ color: "var(--color-ash)" }}
          >
            {formatClock(comment.atMs)}
          </button>
        )}
        {mine && !editing && (
          <button
            onClick={() => {
              setDraft(comment.body);
              setEditing(true);
            }}
            className="ml-auto text-[12px]"
            style={{ color: "var(--color-ink-faint)" }}
          >
            Edit
          </button>
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
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap" style={{ color: "var(--color-ink-dim)" }}>
          {comment.body}
          {comment.editedAt != null && (
            <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {" "}
              (edited)
            </span>
          )}
        </p>
      )}
    </li>
  );
}
