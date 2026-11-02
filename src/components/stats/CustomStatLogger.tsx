"use client";

/**
 * Logging the squad's own stats.
 *
 * One component for both places a stat is logged: the logging page, on the
 * line or typed up afterwards, and the pad beside the footage in the review
 * workspace. They differ only in how an entry is timed, so the host hands in
 * `stamp`: on the line it reads the logger's own match clock (a half and how
 * far into it), against footage it reads the player (a video and a position
 * in it). Everything else is the same, so the two cannot log different sheets.
 *
 * The form is built from the stat's definition. A coach chose what a stat
 * asks when they made it (src/lib/hurling/custom-stats.ts), and nothing else
 * is shown: no number box for a stat that does not count players, no pitch for
 * one that has no place. Like the built-in stats, an entry is stamped the
 * first time the coach touches it, not when they press log, because describing
 * it takes a few seconds and the play has moved on.
 */
import { useMemo, useState, useTransition, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import { VIEW_W, pitchViewHeight } from "@/components/pitch/PitchMarkings";
import {
  deleteCustomEntry,
  logCustomEntry,
  updateCustomEntry,
  type CustomEntryInput,
} from "@/lib/actions/custom-stats";
import {
  CUSTOM_OUTCOME_LABELS,
  CUSTOM_SCORE_LABELS,
  customColour,
  customReady,
  customShape,
  describeCustom,
  scoreChoices,
  type CustomEntryRow,
  type CustomScore,
  type CustomStatDef,
} from "@/lib/hurling/custom-stats";
import { OUTCOME_COLOURS, STAT_OUTCOMES, type Half, type Side, type StatOutcome } from "@/lib/hurling/stats";
import type { GameCode } from "@/lib/hurling/codes";
import { Check, Choice, NumberField } from "./StatFields";
import { playerLabel, type NumberSheet } from "./types";

/** When an entry was seen, as the host's clock reads it. */
export type EntryStamp = {
  half: Half | null;
  /** How far into the half, on the line. */
  halfMs?: number | null;
  /** The footage it was read from, and where in it. */
  videoId?: string | null;
  atMs?: number | null;
};

type Form = {
  side: Side | null;
  playerNumber: string;
  oppositionNumber: string;
  outcome: StatOutcome | null;
  ledToScore: boolean;
  score: CustomScore | null;
};

const blank = (def: CustomStatDef | undefined): Form => ({
  side: !def || def.sideMode === "ask" ? null : def.sideMode,
  playerNumber: "",
  oppositionNumber: "",
  outcome: null,
  ledToScore: false,
  score: null,
});

type Point = { x: number; y: number };

export function CustomStatLogger({
  matchId,
  code,
  defs,
  sheet,
  rows,
  setRows,
  stamp,
  locked = false,
  compact = false,
  turned = false,
  onWatch,
  idPrefix,
}: {
  matchId: string;
  code: GameCode;
  /** The squad's active stats. */
  defs: CustomStatDef[];
  sheet: NumberSheet;
  /** Held by the host, so the report and the lists agree on one set of entries. */
  rows: CustomEntryRow[];
  setRows: Dispatch<SetStateAction<CustomEntryRow[]>>;
  /** The moment an entry is first touched, or null when nothing can be logged yet. */
  stamp: () => EntryStamp | null;
  /** Fades the form until a half is on. */
  locked?: boolean;
  /** One column, for the narrow side panel beside the footage. */
  compact?: boolean;
  /** Which way round this logger sees the pitch. */
  turned?: boolean;
  /** Watch an entry back on the footage, when the host has some. */
  onWatch?: (row: { atMs: number | null }) => void;
  idPrefix: string;
}) {
  const [defId, setDefId] = useState(defs[0]?.id ?? "");
  const def = defs.find((d) => d.id === defId) ?? defs[0];
  const [form, setForm] = useState<Form>(() => blank(def));
  const [origin, setOrigin] = useState<Point | null>(null);
  const [dest, setDest] = useState<Point | null>(null);
  const [seen, setSeen] = useState<EntryStamp | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  const startEntry = () => {
    if (editingId || seen !== null) return;
    setSeen(stamp());
  };

  const reset = (next: CustomStatDef = def) => {
    setForm(blank(next));
    setOrigin(null);
    setDest(null);
    setSeen(null);
    setEditingId(null);
    setError(null);
  };

  const choose = (next: CustomStatDef) => {
    setDefId(next.id);
    reset(next);
    // Choosing a stat is the coach starting an entry: the play is on now.
    setSeen(stamp());
  };

  const place = (p: Point) => {
    if (!def || def.points === 0) return;
    startEntry();
    if (def.points === 1) {
      setOrigin(p);
      return;
    }
    // Two points: from, then to. A third click starts again.
    if (!origin || dest) {
      setOrigin(p);
      setDest(null);
    } else {
      setDest(p);
    }
  };

  const defById = useMemo(() => new Map(defs.map((d) => [d.id, d])), [defs]);
  const mine = useMemo(() => rows.filter((r) => defById.has(r.statId)), [rows, defById]);

  const marks: PitchMark[] = useMemo(() => {
    if (!def) return [];
    const existing = rows
      .filter((r) => r.statId === def.id && r.id !== editingId && r.originX != null && r.originY != null)
      .map(
        (r): PitchMark => ({
          id: r.id,
          x: r.originX!,
          y: r.originY!,
          toX: r.destX,
          toY: r.destY,
          colour: customColour(r),
          shape: customShape(r),
          label: r.playerNumber != null ? String(r.playerNumber) : null,
          title: describeCustom(def, r),
          muted: true,
        }),
      );
    if (!origin) return existing;
    return [
      ...existing,
      {
        id: "draft",
        x: origin.x,
        y: origin.y,
        toX: dest?.x ?? null,
        toY: dest?.y ?? null,
        colour: customColour({ outcome: form.outcome }),
        shape: customShape({ outcome: form.outcome }),
        label: def.askPlayer && form.playerNumber ? form.playerNumber : null,
        title: "This entry",
        selected: true,
      },
    ];
  }, [def, rows, editingId, origin, dest, form.outcome, form.playerNumber]);

  if (!def) return null;

  const ready = customReady(def, form);

  const submit = () => {
    if (!ready || pending) return;
    const when = editingId ? seen : (seen ?? stamp());
    if (!editingId && !when) {
      setError("Tap the next whistle first. Stats are logged while a half is on.");
      return;
    }
    const input: CustomEntryInput = {
      side: form.side,
      playerNumber: form.playerNumber,
      oppositionNumber: form.oppositionNumber,
      outcome: form.outcome,
      ledToScore: form.ledToScore,
      score: form.score,
      originX: origin?.x ?? null,
      originY: origin?.y ?? null,
      destX: dest?.x ?? null,
      destY: dest?.y ?? null,
      half: when?.half ?? null,
      halfMs: when?.halfMs ?? null,
      videoId: when?.videoId ?? null,
      atMs: when?.atMs ?? null,
    };

    startTransition(async () => {
      try {
        if (editingId) {
          const saved = await updateCustomEntry(editingId, input);
          setRows((prev) => prev.map((r) => (r.id === editingId ? saved : r)));
        } else {
          const saved = await logCustomEntry(matchId, def.id, input);
          setRows((prev) => [...prev, saved]);
        }
        reset();
      } catch (err) {
        setError((err as Error).message || "That entry could not be saved.");
      }
    });
  };

  const edit = (row: CustomEntryRow) => {
    const own = defById.get(row.statId);
    if (!own) return;
    setDefId(own.id);
    setForm({
      side: row.side,
      playerNumber: row.playerNumber?.toString() ?? "",
      oppositionNumber: row.oppositionNumber?.toString() ?? "",
      outcome: row.outcome,
      ledToScore: row.ledToScore === true,
      score: row.score,
    });
    setOrigin(row.originX != null && row.originY != null ? { x: row.originX, y: row.originY } : null);
    setDest(row.destX != null && row.destY != null ? { x: row.destX, y: row.destY } : null);
    setSeen({ half: row.half, halfMs: row.halfMs, videoId: row.videoId, atMs: row.atMs });
    setEditingId(row.id);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (editingId === id) reset();
    startTransition(async () => {
      try {
        await deleteCustomEntry(id);
      } catch (err) {
        setError((err as Error).message || "That entry could not be deleted.");
      }
    });
  };

  const newest = [...mine].sort((a, b) => b.createdAt - a.createdAt);
  const id = (name: string) => `${idPrefix}-${name}`;

  const pitchHint =
    def.points === 2
      ? !origin
        ? "Tap where it started"
        : !dest
          ? "Now tap where it went"
          : "Tap again to start over"
      : origin
        ? "Tap again to move it"
        : "Tap the pitch, or leave it unplaced";

  const fields = (
    <>
      {def.sideMode === "ask" && (
        <Choice
          label="Whose was it"
          value={form.side}
          onChange={(v) => patch({ side: v as Side })}
          options={[
            { value: "us", label: "Ours" },
            { value: "opposition", label: "Theirs" },
          ]}
        />
      )}
      {def.askPlayer && (
        <NumberField
          id={id("player")}
          label="Our player's number"
          value={form.playerNumber}
          onChange={(playerNumber) => {
            startEntry();
            patch({ playerNumber });
          }}
          sheet={sheet}
        />
      )}
      {def.askOpposition && (
        <NumberField
          id={id("theirs")}
          label="Their player's number"
          value={form.oppositionNumber}
          onChange={(oppositionNumber) => {
            startEntry();
            patch({ oppositionNumber });
          }}
          sheet={sheet}
          theirs
        />
      )}
      {def.askOutcome && (
        <Choice
          label="How it went"
          value={form.outcome}
          onChange={(v) => patch({ outcome: v as StatOutcome })}
          options={STAT_OUTCOMES.map((o) => ({
            value: o,
            label: CUSTOM_OUTCOME_LABELS[o],
            colour: OUTCOME_COLOURS[o],
          }))}
        />
      )}
      {def.scoreMode === "led_to" && (
        <div className="self-end pb-2">
          <Check checked={form.ledToScore} onChange={(ledToScore) => patch({ ledToScore })} label="Led to a score" />
        </div>
      )}
      {def.scoreMode === "which" && (
        <Choice
          label="Which score"
          clearable
          value={form.score}
          onChange={(v) => patch({ score: v as CustomScore })}
          onClear={() => patch({ score: null })}
          options={scoreChoices(code).map((s) => ({ value: s, label: CUSTOM_SCORE_LABELS[s] }))}
          note="Leave it empty when no score came of it. This does not add to the match score."
        />
      )}
    </>
  );

  const pitch = def.points > 0 && (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="label">Where on the pitch</span>
        <span className="text-right text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {pitchHint}
        </span>
      </div>
      <PitchMap marks={marks} onPlace={place} turned={turned} code={code} />
      {(origin || dest) && (
        <button
          onClick={() => {
            setOrigin(null);
            setDest(null);
          }}
          className="btn-ghost mt-1.5 text-xs"
        >
          Clear the point{def.points === 2 ? "s" : ""}
        </button>
      )}
    </div>
  );

  const picker = (
    <div className="flex flex-wrap gap-1.5">
      {defs.map((d) => {
        const here = d.id === def.id;
        const n = rows.filter((r) => r.statId === d.id).length;
        return (
          <button
            key={d.id}
            onClick={() => choose(d)}
            aria-pressed={here}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-[14px] transition-colors pointer-coarse:px-3 pointer-coarse:py-2.5"
            style={{
              border: `1px solid ${here ? "var(--color-ink)" : "var(--color-line-strong)"}`,
              background: here ? "var(--color-surface-2)" : "transparent",
              color: here ? "var(--color-ink)" : "var(--color-ink-dim)",
            }}
          >
            {d.name}
            {n > 0 && (
              <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const logBar = (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-2 border-t pt-4"
          : "sticky bottom-0 z-10 -mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:static lg:mx-0 lg:px-0 lg:pb-0"
      }
      style={{ borderColor: "var(--color-line)", background: compact ? undefined : "var(--color-stage)" }}
    >
      <button onClick={submit} disabled={!ready || pending} className="btn-primary max-lg:min-h-12 max-lg:flex-1">
        {editingId ? "Save changes" : `Log ${def.name.toLowerCase()}`}
      </button>
      {editingId && (
        <button onClick={() => reset()} className="btn-ghost text-xs">
          Cancel
        </button>
      )}
      {!editingId && !ready && (
        <span className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          {def.sideMode === "ask" && !form.side
            ? "Say whose it was first"
            : def.askOutcome && !form.outcome
              ? "Pick how it went first"
              : "Check the numbers"}
        </span>
      )}
    </div>
  );

  const errorBox = error && (
    <p
      className="basis-full rounded px-3 py-2 text-[13px]"
      style={{
        background: "color-mix(in oklab, var(--color-danger) 20%, transparent)",
        color: "var(--color-ink)",
      }}
    >
      {error}
    </p>
  );

  const list = (
    <section className={compact ? "mt-6 border-t pt-3" : "mt-8"} style={compact ? { borderColor: "var(--color-line-strong)" } : undefined}>
      <div
        className="flex items-baseline justify-between border-b pb-2"
        style={{ borderColor: "var(--color-line-strong)" }}
      >
        <h2 className={compact ? "title text-sm" : "title text-base"}>Your own stats so far</h2>
        <span className="tabular text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          {mine.length}
        </span>
      </div>
      {mine.some((r) => r.draft) && (
        <p className="pt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Only you can see these until you submit them at full time.
        </p>
      )}
      {newest.length === 0 ? (
        <p className="py-6 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
          Nothing yet. Pick a stat, fill in what it asks, then log it.
        </p>
      ) : (
        <ul className={compact ? "" : "grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3"}>
          {newest.map((r) => {
            const own = defById.get(r.statId)!;
            const shape = customShape(r);
            const colour = r.outcome ? customColour(r) : "var(--color-line-strong)";
            const who = [
              r.playerNumber != null ? playerLabel(r.playerNumber, sheet) : null,
              r.oppositionNumber != null ? `their ${r.oppositionNumber}` : null,
            ]
              .filter(Boolean)
              .join(", against ");
            return (
              <li
                key={r.id}
                className="fixture group flex items-start gap-2.5 py-2.5"
                style={{ background: r.id === editingId ? "var(--color-surface-2)" : undefined }}
              >
                <span
                  aria-hidden
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: shape === "filled" ? colour : "transparent",
                    border: shape === "filled" ? "none" : `2px ${shape === "dashed" ? "dashed" : "solid"} ${colour}`,
                  }}
                />
                <button
                  onClick={() => onWatch && r.atMs != null && onWatch(r)}
                  disabled={!onWatch || r.atMs == null}
                  title={onWatch && r.atMs != null ? "Watch this back" : undefined}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <div className="text-[14px]">{describeCustom(own, r)}</div>
                  <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                    {who || "Nobody named"}
                    {r.half && `, ${r.half === 1 ? "1st" : "2nd"} half`}
                    {r.originX != null && ", on the map"}
                  </div>
                </button>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                  <button onClick={() => edit(r)} className="px-1 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
                    Edit
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="px-1 text-[12px]"
                    style={{ color: "var(--color-danger-ink)" }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  if (compact) {
    return (
      <div className="space-y-4" style={{ opacity: locked ? 0.35 : 1 }}>
        {picker}
        <div className="flex flex-wrap items-start gap-x-7 gap-y-3 *:max-w-full *:min-w-0">{fields}</div>
        {pitch}
        {errorBox}
        {logBar}
        {list}
      </div>
    );
  }

  return (
    <>
      <div
        className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,max(26rem,min(calc((100dvh_-_19rem)_*_var(--pitch-ratio)),calc(100vw_-_34.5rem))))_minmax(23rem,1fr)]"
        style={{ "--pitch-ratio": String(VIEW_W / pitchViewHeight()) } as CSSProperties}
      >
        <section
          className="min-w-0 transition-opacity"
          inert={locked}
          style={{ opacity: locked ? 0.35 : 1 }}
        >
          {pitch || (
            <p className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
              This stat has no place on the pitch. Fill in what it asks and log it.
            </p>
          )}
        </section>

        <section
          className="@container flex min-w-0 flex-col transition-opacity lg:border-l lg:pl-6"
          inert={locked}
          style={{ borderColor: "var(--color-line)", opacity: locked ? 0.35 : 1 }}
        >
          {picker}
          <div className="mt-4 flex flex-wrap items-start gap-x-7 gap-y-3 *:max-w-full *:min-w-0">
            {fields}
            {errorBox}
          </div>
          {logBar}
        </section>
      </div>
      {list}
    </>
  );
}
