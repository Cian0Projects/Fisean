"use client";

/**
 * The comment that comes up when playback stops on it.
 *
 * Over the picture rather than beside it, so it is read with the frame it is
 * about, in full screen and on a phone held sideways as much as at a desk.
 * Kept to the lower corner and capped in height, because the drawing on the
 * same frame is usually what it is pointing at.
 */
import type { Stop } from "@/lib/hurling/stops";
import type { CommentRow } from "@/components/review/types";
import { formatClock } from "@/lib/hurling/notation";
import { PlayIcon } from "@/components/ui/Icon";

export function StopCard({ stop, onPlay }: { stop: Stop<CommentRow>; onPlay: () => void }) {
  const said = stop.comments.filter((c) => c.body);
  const drew = [...new Set(stop.comments.filter((c) => c.shapes?.length).map((c) => c.authorName))];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex p-2 sm:p-4">
      <div
        role="status"
        className="pointer-events-auto max-w-md border border-t-[3px] px-3.5 py-2.5"
        style={{
          background: "color-mix(in oklab, var(--color-surface-2) 94%, transparent)",
          borderColor: "var(--color-line-strong)",
          borderTopColor: "var(--color-rule)",
          borderRadius: 2,
          color: "var(--color-ink)",
        }}
      >
        <ul className="max-h-[28vh] space-y-2 overflow-y-auto">
          {said.map((c) => (
            <li key={c.id} className="text-[14px] leading-snug">
              <span className="font-semibold">{c.authorName}</span>{" "}
              <span className="tabular text-[12px]" style={{ color: "var(--color-ash)" }}>
                {formatClock(stop.atMs)}
              </span>
              <p className="mt-0.5 whitespace-pre-wrap" style={{ color: "var(--color-ink-dim)" }}>
                {c.body}
              </p>
            </li>
          ))}
          {!said.length && (
            <li className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
              {drew.join(" and ")} drew on this moment.
            </li>
          )}
        </ul>
        <button onClick={onPlay} className="btn-primary mt-2.5 text-xs">
          <PlayIcon className="h-3.5 w-3.5" />
          Play on
        </button>
      </div>
    </div>
  );
}
