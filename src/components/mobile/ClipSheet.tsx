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
 * Everything else is chips, not dropdowns — tags, then the players in it —
 * because a chip is one tap and a `<select>` on a phone is three and a
 * spinning wheel. Text inputs are set at 16 px on purpose: anything smaller
 * and iOS zooms the whole page in on focus and leaves it there.
 */
import { useMemo, useState } from "react";
import type { PlayerEngine } from "@/components/player/engine";
import { formatClockPrecise, toGameTime, type Markers } from "@/lib/hurling/notation";
import { nudgeEdge } from "@/lib/hurling/clip-rules";
import { PlayIcon } from "@/components/ui/Icon";
import { eventLabelOf, type EventTypeRow, type SquadMember } from "@/components/review/types";

export type ClipDraft = {
  startMs: number;
  endMs: number;
  title: string;
  eventTypeIds: string[];
  playerIds: string[];
  visibility: "team" | "private";
};

type Props = {
  heading: string;
  initial: ClipDraft;
  engine: PlayerEngine;
  durationMs: number;
  markers: Markers;
  halfLengthMin: number;
  eventTypes: EventTypeRow[];
  squad: SquadMember[];
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
  eventTypes,
  squad,
  onSave,
  onClose,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState(initial);

  const byCategory = useMemo(() => {
    const groups = new Map<string, EventTypeRow[]>();
    for (const e of eventTypes) groups.set(e.category, [...(groups.get(e.category) ?? []), e]);
    return [...groups];
  }, [eventTypes]);

  const nudge = (edge: "start" | "end", delta: number) => {
    const next = nudgeEdge(draft, edge, delta, durationMs);
    setDraft((d) => ({ ...d, ...next }));
    // Show the frame the moved end now sits on.
    engine.pause();
    engine.setBounds(next.startMs, next.endMs);
    engine.seek(edge === "start" ? next.startMs : next.endMs, { exact: true });
  };

  const toggle = (key: "eventTypeIds" | "playerIds", id: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id],
    }));

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

          {byCategory.map(([category, list]) => (
            <fieldset key={category} className="mt-4">
              <legend className="label mb-1.5">{sentence(category)}</legend>
              <div className="flex flex-wrap gap-2">
                {list.map((e) => (
                  <Chip
                    key={e.id}
                    on={draft.eventTypeIds.includes(e.id)}
                    onClick={() => toggle("eventTypeIds", e.id)}
                  >
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: e.colour }} />
                    {eventLabelOf(e)}
                  </Chip>
                ))}
              </div>
            </fieldset>
          ))}

          {squad.length > 0 && (
            <fieldset className="mt-4">
              <legend className="label mb-1.5">Who is in it</legend>
              <div className="flex flex-wrap gap-2">
                {squad.map((p) => (
                  <Chip key={p.id} on={draft.playerIds.includes(p.id)} onClick={() => toggle("playerIds", p.id)}>
                    {p.displayName}
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="mt-4">
            <legend className="label mb-1.5">Who can see it</legend>
            <div className="grid grid-cols-2 gap-2">
              <Chip on={draft.visibility === "team"} onClick={() => setDraft((d) => ({ ...d, visibility: "team" }))}>
                The squad
              </Chip>
              <Chip
                on={draft.visibility === "private"}
                onClick={() => setDraft((d) => ({ ...d, visibility: "private" }))}
              >
                Only me
              </Chip>
            </div>
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded border px-3 text-[14px] transition-colors"
      style={{
        background: on ? "var(--color-surface-3)" : "transparent",
        borderColor: on ? "var(--color-ash)" : "var(--color-line-strong)",
        color: on ? "var(--color-ink)" : "var(--color-ink-dim)",
      }}
    >
      {children}
    </button>
  );
}

/** "set_piece" to "Set piece": sentence case, as everywhere else. */
function sentence(slug: string): string {
  const words = slug.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
