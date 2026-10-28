"use client";

/**
 * The sheet a clip is finished in, on a phone.
 *
 * It rises from the bottom and stops short of the video, so the picture stays
 * in view above it: every −1 s / +1 s tap parks the video on the frame that
 * end now sits on, and you can see what you are cutting. Buttons replace the
 * desktop's drag handles because a thumb can tap four times far more
 * accurately than it can drag to a tenth of a second.
 *
 * Then a title, in your own words (no event tags: what a clip is goes in its
 * title), and who can see it, which is chips because a chip is one tap and a
 * `<select>` on a phone is three and a spinning wheel. Text inputs are set at
 * 16 px on purpose: anything smaller and iOS zooms the whole page in on focus
 * and leaves it there.
 */
import { useState } from "react";
import type { PlayerEngine } from "@/components/player/engine";
import { formatClockPrecise, toGameTime, type Markers } from "@/lib/hurling/notation";
import { nudgeEdge } from "@/lib/hurling/clip-rules";
import { PlayIcon } from "@/components/ui/Icon";
import type { SquadMember } from "@/components/review/types";
import { describeAudience, type Audience } from "@/lib/auth/visibility";
import { AudiencePicker } from "@/components/ui/AudiencePicker";

export type ClipDraft = {
  startMs: number;
  endMs: number;
  title: string;
  audience: Audience;
};

type Props = {
  heading: string;
  initial: ClipDraft;
  engine: PlayerEngine;
  durationMs: number;
  markers: Markers;
  halfLengthMin: number;
  squad: SquadMember[];
  /** Who made the clip; only they say who sees it (canShare). */
  makerId: string | null;
  maker: string;
  shareable: boolean;
  onSave: (draft: ClipDraft) => void;
  onClose: () => void;
  onDelete?: () => void;
};

const STEP_MS = 1000;

export function ClipSheet({
  heading,
  initial,
  engine,
  durationMs,
  markers,
  halfLengthMin,
  squad,
  makerId,
  maker,
  shareable,
  onSave,
  onClose,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState(initial);

  const nudge = (edge: "start" | "end", delta: number) => {
    const next = nudgeEdge(draft, edge, delta, durationMs);
    setDraft((d) => ({ ...d, ...next }));
    // Show the frame the moved end now sits on.
    engine.pause();
    engine.setBounds(next.startMs, next.endMs);
    engine.seek(edge === "start" ? next.startMs : next.endMs, { exact: true });
  };

  const seconds = Math.round((draft.endMs - draft.startMs) / 100) / 10;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal aria-label={heading}>
      <button
        aria-label="Close"
        className="flex-1"
        style={{ background: "color-mix(in oklab, var(--color-stage) 45%, transparent)" }}
        onClick={onClose}
      />

      <div
        className="mx-auto flex max-h-[68dvh] w-full max-w-xl flex-col rounded-t-xl border-t"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-line-strong)" }}
      >
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-2">
          <div className="flex items-baseline justify-between">
            <h2 className="title text-xl">{heading}</h2>
            <span className="tabular text-[14px]" style={{ color: "var(--color-ash)" }}>
              {seconds} s
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {(["start", "end"] as const).map((edge) => {
              const at = edge === "start" ? draft.startMs : draft.endMs;
              return (
                <div key={edge} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="label">{edge === "start" ? "Start" : "End"}</div>
                    <div className="tabular truncate text-[15px] whitespace-nowrap">
                      {toGameTime(at, markers, halfLengthMin).label}
                      <span className="ml-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        {formatClockPrecise(at)}
                      </span>
                    </div>
                  </div>
                  <button className="btn-outline min-h-11 min-w-16 text-[15px]" onClick={() => nudge(edge, -STEP_MS)}>
                    −1 s
                  </button>
                  <button className="btn-outline min-h-11 min-w-16 text-[15px]" onClick={() => nudge(edge, STEP_MS)}>
                    +1 s
                  </button>
                </div>
              );
            })}
            <button
              className="btn-ghost min-h-11 w-full text-[15px]"
              onClick={() => engine.playRange(draft.startMs, draft.endMs)}
            >
              <PlayIcon size={12} />
              Play it back
            </button>
          </div>

          <label htmlFor="clip-title" className="label mt-4 mb-1.5 block">
            Title
          </label>
          <input
            id="clip-title"
            className="field text-[16px]"
            placeholder="What happened?"
            value={draft.title}
            enterKeyHint="done"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />

          <fieldset className="mt-4">
            <legend className="label mb-1.5">Who can see it</legend>
            {shareable ? (
              <AudiencePicker
                value={draft.audience}
                onChange={(audience) => setDraft((d) => ({ ...d, audience }))}
                people={squad}
                makerId={makerId}
                maker={maker}
              />
            ) : (
              <p className="text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
                {describeAudience(draft.audience, (id) => squad.find((m) => m.id === id)?.displayName, maker)} Only{" "}
                {maker} can change that.
              </p>
            )}
          </fieldset>
        </div>

        <div
          className="flex gap-2 border-t px-4 pt-3"
          style={{
            borderColor: "var(--color-line)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
          }}
        >
          {onDelete && (
            <button className="btn-ghost min-h-12 text-[15px]" style={{ color: "var(--color-danger-ink)" }} onClick={onDelete}>
              Delete
            </button>
          )}
          <span className="flex-1" />
          <button className="btn-ghost min-h-12 text-[15px]" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary min-h-12 px-6 text-[15px]" onClick={() => onSave(draft)}>
            Save clip
          </button>
        </div>
      </div>
    </div>
  );
}
