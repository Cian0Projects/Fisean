"use client";

/**
 * The drill board: a full pitch, two sides of discs and as many balls as the
 * drill needs, moved step by step and played back as an animation.
 *
 * Editing happens on one step at a time. Where each piece stood the step
 * before is drawn as a dashed ghost with an arrow to where it stands now, so
 * the coach sees the movement they are drawing while they draw it — a solid
 * arrow for a run, a dashed one for the ball, as on any whiteboard.
 *
 * Playback runs on requestAnimationFrame over `positionsAt`, which does the
 * easing; this file only advances the clock. While the clock is anywhere
 * but a whole step the board is read-only, because a drag halfway between
 * two steps would have no step to belong to.
 *
 * Saving is automatic, a moment after the last change, so a coach planning
 * a session on a phone in the car park never loses a drill to a dropped tab.
 */
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { PITCH_FILL, PitchMarkings, VIEW_W } from "@/components/pitch/PitchMarkings";
import { deleteDrill, duplicateDrill, saveDrill } from "@/lib/actions/drills";
import {
  BALL_KINDS,
  BALL_LABELS,
  DRILL_LIMITS,
  DRILL_PRESETS,
  GOAL_WIDTHS_M,
  KIT_LIMITS,
  DRILL_SIDES,
  STEP_MS,
  addBall,
  addCone,
  addGoal,
  clearCones,
  markOutSmallPitch,
  moveKit,
  removeKit,
  setGoalWidth,
  turnGoal,
  applyPreset,
  matchingPreset,
  addStep,
  ballsOf,
  movePiece,
  playersOf,
  positionsAt,
  removePiece,
  removeStep,
  setLabel,
  setSideCount,
  setSideName,
  setStepNote,
  type DrillData,
  type DrillKit,
  type DrillPiece,
  type DrillSide,
  type Point,
} from "@/lib/hurling/drill";
import { DrillMarkers, H, KitHitArea, KitMark, Movement, Piece, SIDE_COLOUR } from "./DrillArt";
import { recordDrill } from "./recordDrill";

type Status = "saved" | "unsaved" | "saving" | "error";
const SPEEDS = [0.5, 1, 2] as const;
/** How long after the last change the drill is saved. */
const SAVE_AFTER_MS = 900;

export function DrillEditor({
  id,
  teamName,
  initial,
}: {
  id: string;
  /** Printed in the corner of an exported video. */
  teamName: string;
  initial: { title: string; notes: string; data: DrillData };
}) {
  const uid = useId().replace(/:/g, "");
  const [data, setData] = useState(initial.data);
  const [title, setTitle] = useState(initial.title);
  const [notes, setNotes] = useState(initial.notes);

  const [step, setStep] = useState(0);
  /** Playback time in steps; null while editing a whole step. */
  const [t, setT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>("saved");
  const [rev, setRev] = useState(0);
  const [pending, startTransition] = useTransition();

  /** Recording progress, 0–1, while a video is being made. */
  const [recording, setRecording] = useState<number | null>(null);
  const [video, setVideo] = useState<{ url: string; file: File } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const grab = useRef<Point>({ x: 0, y: 0 });
  const clock = useRef(0);
  const revRef = useRef(0);
  const latest = useRef({ title, notes, data });

  const lastStep = data.steps.length - 1;
  const editing = t === null;
  const current = Math.min(step, lastStep);

  /* ------------------------------------------------------------ saving */

  useEffect(() => {
    latest.current = { title, notes, data };
  });

  const touch = () => {
    revRef.current += 1;
    setRev(revRef.current);
    setStatus("unsaved");
  };
  const update = (fn: (d: DrillData) => DrillData) => {
    setData(fn);
    touch();
  };

  const persist = useCallback(async () => {
    const mine = revRef.current;
    setStatus("saving");
    try {
      await saveDrill(id, latest.current);
      if (revRef.current === mine) setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    if (rev === 0) return;
    const h = setTimeout(() => void persist(), SAVE_AFTER_MS);
    return () => clearTimeout(h);
  }, [rev, persist]);

  useEffect(() => {
    if (status === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  /* ---------------------------------------------------------- playback */

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clock.current += ((now - last) / STEP_MS) * speed;
      last = now;
      if (clock.current >= lastStep) {
        // Land on the final step, editable, rather than frozen at the end.
        setPlaying(false);
        setT(null);
        setStep(lastStep);
        return;
      }
      setT(clock.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, lastStep]);

  const play = () => {
    if (lastStep === 0) return;
    // Resume where it paused; from the start if it is sitting on the end.
    const from = t !== null && t < lastStep ? t : current < lastStep ? current : 0;
    clock.current = from;
    setT(from);
    setSelected(null);
    setPlaying(true);
  };

  const goToStep = (i: number) => {
    setPlaying(false);
    setT(null);
    setStep(i);
  };

  /* ----------------------------------------------------------- dragging */

  const pointerAt = (e: React.PointerEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const shown = editing ? data.steps[current].at : positionsAt(data, t);
  const before = editing && current > 0 ? data.steps[current - 1].at : null;

  /* ------------------------------------------------------------ export */

  // A finished video's object URL is let go when it is replaced or the editor closes.
  useEffect(() => {
    if (!video) return;
    return () => URL.revokeObjectURL(video.url);
  }, [video]);

  const exportVideo = async () => {
    if (!svgRef.current) return;
    setPlaying(false);
    setVideoError(null);
    setVideo(null);
    setRecording(0);
    try {
      const { blob, ext } = await recordDrill({
        board: svgRef.current,
        data,
        title,
        teamName,
        speed,
        onProgress: setRecording,
      });
      const file = new File([blob], `${fileName(title)}.${ext}`, { type: blob.type });
      const url = URL.createObjectURL(file);
      setVideo({ url, file });
      // On a computer, the file simply downloads. On a phone a download goes
      // nowhere useful, so the save and share buttons wait for a tap instead.
      if (!matchMedia("(pointer: coarse)").matches) {
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
      }
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "The video could not be made.");
    } finally {
      setRecording(null);
    }
  };

  const isKit = (id: string) => data.kit.some((k) => k.id === id);

  /** Players and balls move on this step only; kit moves for the whole drill. */
  const startDrag = (e: React.PointerEvent, id: string, at: Point) => {
    e.stopPropagation();
    setSelected(id);
    if (!editing) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = pointerAt(e);
    // Hold the piece where it was grabbed, so it does not jump to centre on the finger.
    grab.current = { x: at.x - p.x, y: at.y - p.y };
    setDragId(id);
  };

  const drag = (e: React.PointerEvent) => {
    if (!dragId) return;
    const p = pointerAt(e);
    const to = { x: p.x + grab.current.x, y: p.y + grab.current.y };
    update((d) => (isKit(dragId) ? moveKit(d, dragId, to) : movePiece(d, current, dragId, to)));
  };

  const keyKit = (e: React.KeyboardEvent, k: DrillKit) => {
    const step = e.shiftKey ? 0.04 : 0.01;
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (dir[e.key] && editing) {
      e.preventDefault();
      const [dx, dy] = dir[e.key];
      update((d) => moveKit(d, k.id, { x: k.x + dx, y: k.y + dy }));
    } else if ((e.key === "r" || e.key === "R") && k.kind === "goal") {
      e.preventDefault();
      update((d) => turnGoal(d, k.id));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      update((d) => removeKit(d, k.id));
      setSelected(null);
    }
  };

  const nudge = (e: React.KeyboardEvent, piece: DrillPiece) => {
    const step = e.shiftKey ? 0.04 : 0.01;
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (dir[e.key] && editing) {
      e.preventDefault();
      const [dx, dy] = dir[e.key];
      const at = data.steps[current].at[piece.id];
      update((d) => movePiece(d, current, piece.id, { x: at.x + dx, y: at.y + dy }));
    } else if ((e.key === "Delete" || e.key === "Backspace") && piece.kind === "ball") {
      e.preventDefault();
      update((d) => removePiece(d, piece.id));
      setSelected(null);
    }
  };

  // Players under the balls, so a ball being carried stays visible; the piece
  // being dragged above everything.
  const order = [
    ...data.pieces.filter((p) => p.kind === "player"),
    ...data.pieces.filter((p) => p.kind === "ball"),
  ].sort((a, b) => Number(a.id === dragId) - Number(b.id === dragId));

  const sideName = (s: DrillSide) => data.sides[s].name || (s === "a" ? "Side A" : "Side B");
  const describe = (p: DrillPiece) => {
    if (p.kind === "player") return `${sideName(p.side)} ${p.label}`;
    // Numbered within its kind, and only once there is more than one of it.
    const same = ballsOf(data).filter((b) => b.ball === p.ball);
    return same.length > 1
      ? `${BALL_LABELS[p.ball]} ${same.findIndex((b) => b.id === p.id) + 1}`
      : BALL_LABELS[p.ball];
  };
  const chosen = data.pieces.find((p) => p.id === selected) ?? null;
  const chosenKit = data.kit.find((k) => k.id === selected) ?? null;
  const cones = data.kit.filter((k) => k.kind === "cone").length;
  const goals = data.kit.length - cones;
  const describeKit = (k: DrillKit) => {
    if (k.kind === "cone") return "Cone";
    const n = data.kit.filter((g) => g.kind === "goal").findIndex((g) => g.id === k.id) + 1;
    return `${k.width === "full" ? "Full goal" : "Small goal"}${goals > 1 ? ` ${n}` : ""}`;
  };
  const lineUp = matchingPreset(data);
  const playingStep = editing ? current : Math.min(lastStep, Math.ceil(t - 1e-6));

  /* ------------------------------------------------------------- render */

  return (
    <main className="sheet pt-6 pb-20 lg:pt-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        <Link href="/drills" className="hover:underline" style={{ color: "var(--color-ink-dim)" }}>
          All drills
        </Link>
        <SaveState status={status} onRetry={() => void persist()} />
        <div className="flex-1" />
        <button
          type="button"
          className="btn-ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (status !== "saved") await persist();
              await duplicateDrill(id);
            })
          }
        >
          Duplicate
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete “${title || "Untitled drill"}”? This cannot be undone.`)) return;
            startTransition(() => deleteDrill(id));
          }}
        >
          Delete
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          touch();
        }}
        maxLength={DRILL_LIMITS.title}
        placeholder="Name the drill"
        aria-label="Drill name"
        className="display mt-3 w-full bg-transparent text-[clamp(2rem,4.5vw,3.25rem)] outline-none placeholder:text-[var(--color-ink-faint)]"
      />

      <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${H}`}
            className="block h-auto w-full select-none"
            style={{
              background: PITCH_FILL,
              border: "1px solid var(--color-line)",
              borderRadius: 4,
              printColorAdjust: "exact",
              WebkitPrintColorAdjust: "exact",
            }}
            onPointerDown={() => setSelected(null)}
            onPointerMove={drag}
            onPointerUp={() => setDragId(null)}
            onPointerCancel={() => setDragId(null)}
            role="group"
            aria-label="Drill board. Drag a piece, or focus it and use the arrow keys."
          >
            <DrillMarkers uid={uid} />
            {/* `data-export` marks what an exported video draws once as its
                background: the pitch and the kit, which never move. */}
            <g data-export="">
              <PitchMarkings />
            </g>

            {/* Kit under everyone: the pitch the drill is played on. */}
            <g data-export="">
              {data.kit.map((k) => (
                <g
                  key={k.id}
                  tabIndex={0}
                  role="button"
                  aria-label={k.kind === "goal" ? `${describeKit(k)}. Press R to turn it.` : describeKit(k)}
                  aria-pressed={selected === k.id}
                  onPointerDown={(e) => startDrag(e, k.id, k)}
                  onFocus={() => setSelected(k.id)}
                  onKeyDown={(e) => keyKit(e, k)}
                  style={{
                    cursor: editing ? (dragId === k.id ? "grabbing" : "grab") : "default",
                    touchAction: "none",
                    outline: "none",
                  }}
                >
                  <title>{describeKit(k)}</title>
                  <KitHitArea item={k} />
                  <KitMark item={k} selected={selected === k.id} />
                </g>
              ))}
            </g>

            {before &&
              data.pieces.map((p) => (
                <g key={`was-${p.id}`}>
                  <Piece piece={p} at={before[p.id]} ghost />
                  <Movement piece={p} from={before[p.id]} to={shown[p.id]} uid={uid} />
                </g>
              ))}

            {order.map((p) => (
              <g
                key={p.id}
                tabIndex={0}
                role="button"
                aria-label={describe(p)}
                aria-pressed={selected === p.id}
                onPointerDown={(e) => startDrag(e, p.id, shown[p.id])}
                onFocus={() => setSelected(p.id)}
                onKeyDown={(e) => nudge(e, p)}
                style={{
                  cursor: editing ? (dragId === p.id ? "grabbing" : "grab") : "default",
                  touchAction: "none",
                  outline: "none",
                }}
              >
                <title>{describe(p)}</title>
                {/* A finger is wider than a player at this scale: the hit area is
                    bigger than the mark, and small enough that markers stay separate. */}
                <circle cx={shown[p.id].x * VIEW_W} cy={shown[p.id].y * H} r={18} fill="transparent" />
                <Piece piece={p} at={shown[p.id]} selected={selected === p.id} />
              </g>
            ))}
          </svg>

          {/* Transport */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <button
              type="button"
              className="btn-primary min-w-[6.5rem]"
              onClick={playing ? () => setPlaying(false) : play}
              disabled={lastStep === 0}
            >
              {playing ? "Pause" : t !== null && t < lastStep ? "Resume" : "Play drill"}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(1, lastStep)}
              step={0.01}
              value={t ?? current}
              disabled={lastStep === 0}
              onChange={(e) => {
                setPlaying(false);
                setT(Number(e.target.value));
              }}
              aria-label="Scrub through the drill"
              className="min-w-[8rem] flex-1"
              style={{ accentColor: "var(--color-ash)" }}
            />
            <div className="flex items-center gap-1" role="group" aria-label="Playback speed">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className="tabular rounded-[2px] border px-2 py-1 text-[12px] font-semibold"
                  style={{
                    borderColor: speed === s ? "var(--color-ash)" : "var(--color-line)",
                    background: speed === s ? "var(--color-spot-tint)" : "transparent",
                    color: speed === s ? "var(--color-ash)" : "var(--color-ink-dim)",
                  }}
                >
                  {s === 0.5 ? "½" : s}×
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-outline tabular min-w-[8.5rem]"
              disabled={recording !== null || lastStep === 0}
              onClick={() => void exportVideo()}
              title={lastStep === 0 ? "Add a step first, so there is something to play" : undefined}
            >
              {recording === null ? "Export video" : `Recording ${Math.round(recording * 100)}%`}
            </button>
          </div>

          {recording !== null && (
            <p className="caption mt-2" aria-live="polite">
              Recording in real time at the speed chosen. Keep this tab in front until it finishes.
            </p>
          )}
          {videoError && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--color-danger-ink)" }} role="alert">
              {videoError}
            </p>
          )}
          {video && recording === null && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
              <span style={{ color: "var(--color-ink-dim)" }}>
                Video ready: {video.file.name.split(".").pop()!.toUpperCase()},{" "}
                {(video.file.size / 1_000_000).toFixed(1)} MB.
              </span>
              <a href={video.url} download={video.file.name} className="btn-primary">
                Save video
              </a>
              {canShareFile(video.file) && (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => void navigator.share({ files: [video.file], title: video.file.name }).catch(() => {})}
                >
                  Share
                </button>
              )}
            </div>
          )}

          {/* Steps */}
          <div className="section-head mt-6 flex flex-wrap items-center gap-2">
            <span className="label mr-2">Steps</span>
            {data.steps.map((_, i) => {
              const here = i === playingStep;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => goToStep(i)}
                  aria-current={editing && here ? "step" : undefined}
                  aria-label={`Step ${i + 1}`}
                  className="tabular inline-flex h-8 min-w-8 items-center justify-center rounded-[2px] border px-2 text-[13px] font-bold transition-colors"
                  style={{
                    borderColor: here ? "var(--color-ash)" : "var(--color-line-strong)",
                    background: here ? "var(--color-ash)" : "transparent",
                    color: here ? "var(--color-on-spot)" : "var(--color-ink-dim)",
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
            <button
              type="button"
              className="btn-outline ml-1"
              disabled={data.steps.length >= DRILL_LIMITS.steps}
              onClick={() => {
                update((d) => addStep(d, current));
                goToStep(current + 1);
              }}
            >
              Add step
            </button>
            {data.steps.length > 1 && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  update((d) => removeStep(d, current));
                  goToStep(Math.max(0, current - 1));
                }}
              >
                Remove step {current + 1}
              </button>
            )}
          </div>

          {editing ? (
            <label className="mt-4 block">
              <span className="label">
                {current === 0 ? "Step 1, the set-up" : `What happens in step ${current + 1}`}
              </span>
              <input
                className="field mt-1.5"
                value={data.steps[current].note}
                maxLength={DRILL_LIMITS.note}
                placeholder={
                  current === 0
                    ? "Who starts where, and who has the ball"
                    : "For example: 5 overlaps on the wing, 11 lays it off"
                }
                onChange={(e) => update((d) => setStepNote(d, current, e.target.value))}
              />
            </label>
          ) : (
            <p className="mt-4 min-h-[3.25rem] text-[15px]" aria-live="polite">
              <span className="title">Step {playingStep + 1}</span>
              {data.steps[playingStep].note && (
                <span style={{ color: "var(--color-ink-dim)" }}> — {data.steps[playingStep].note}</span>
              )}
              {!playing && (
                <span className="caption block mt-1">Paused between steps. Pick a step to move pieces.</span>
              )}
            </p>
          )}
        </section>

        <aside className="space-y-8">
          <p className="caption text-[13px] leading-snug">
            Drag a piece to place it for this step. Add a step and drag again to
            show the next movement; the dashed ghost is where it stood before.
          </p>

          <section>
            <h2 className="section-head title text-[17px]">Players</h2>
            <span className="label mt-3 block">Quick set-up</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Quick set-up">
              {DRILL_PRESETS.map((p) => {
                const on = lineUp?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      // A line-up resets every step; ask once there is movement to lose.
                      if (
                        data.steps.length > 1 &&
                        !confirm(`Line up ${p.label}? Players go back to their starting spots on every step.`)
                      ) {
                        return;
                      }
                      update((d) => applyPreset(d, p.id));
                      setSelected(null);
                    }}
                    className="tabular rounded-[2px] border px-2 py-1 text-[13px] font-semibold whitespace-nowrap transition-colors"
                    style={{
                      borderColor: on ? "var(--color-ash)" : "var(--color-line-strong)",
                      background: on ? "var(--color-spot-tint)" : "transparent",
                      color: on ? "var(--color-ash)" : "var(--color-ink-dim)",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <span className="label mt-4 block">Or set each side, and add as many as you like</span>
            <div className="mt-2 space-y-3">
              {DRILL_SIDES.map((s) => {
                const count = playersOf(data, s).length;
                return (
                  <div key={s} className="flex items-center gap-2.5">
                    <SideSwatch side={s} />
                    <input
                      className="field flex-1 py-1.5"
                      value={data.sides[s].name}
                      maxLength={DRILL_LIMITS.sideName}
                      aria-label={`Name of side ${s.toUpperCase()}`}
                      onChange={(e) => update((d) => setSideName(d, s, e.target.value))}
                    />
                    <Stepper
                      value={count}
                      max={DRILL_LIMITS.playersPerSide}
                      label={sideName(s)}
                      onChange={(n) => {
                        update((d) => setSideCount(d, s, n));
                        setSelected(null);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="section-head title text-[17px]">Balls</h2>
            {ballsOf(data).length > 0 && (
              <ul className="mt-2">
                {ballsOf(data).map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between border-b py-1.5 text-[14px]"
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    <button type="button" className="hover:underline" onClick={() => setSelected(b.id)}>
                      {describe(b)}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1"
                      onClick={() => {
                        update((d) => removePiece(d, b.id));
                        if (selected === b.id) setSelected(null);
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {BALL_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="btn-outline"
                  disabled={ballsOf(data).length >= DRILL_LIMITS.balls}
                  onClick={() => update((d) => addBall(d, k))}
                >
                  Add a {k}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="section-head title text-[17px]">Cones and goals</h2>
            <p className="caption mt-2">
              {cones || goals
                ? `${[cones && `${cones} cone${cones === 1 ? "" : "s"}`, goals && `${goals} extra goal${goals === 1 ? "" : "s"}`]
                    .filter(Boolean)
                    .join(", ")}. They stay put through every step.`
                : "For marking out an area or a small-sided game. They stay put through every step."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-outline"
                disabled={cones >= KIT_LIMITS.cones}
                onClick={() => update(addCone)}
              >
                Add a cone
              </button>
              <button
                type="button"
                className="btn-outline"
                disabled={goals >= KIT_LIMITS.goals}
                onClick={() => update((d) => addGoal(d, "small"))}
              >
                Add a goal
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1">
              <button
                type="button"
                className="btn-ghost -ml-3"
                onClick={() => {
                  if (data.kit.length && !confirm("Mark out a small pitch? The cones and goals already out are taken in.")) {
                    return;
                  }
                  update(markOutSmallPitch);
                  setSelected(null);
                }}
              >
                Mark out a small pitch
              </button>
              {cones > 0 && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    update(clearCones);
                    if (chosenKit?.kind === "cone") setSelected(null);
                  }}
                >
                  Remove all cones
                </button>
              )}
            </div>
          </section>

          {chosenKit && (
            <section>
              <h2 className="section-head title text-[17px]">{describeKit(chosenKit)}</h2>
              {chosenKit.kind === "goal" && (
                <>
                  <span className="label mt-3 block">Width</span>
                  <div className="mt-1.5 flex gap-1.5" role="group" aria-label="Goal width">
                    {(["small", "full"] as const).map((w) => {
                      const on = chosenKit.width === w;
                      return (
                        <button
                          key={w}
                          type="button"
                          aria-pressed={on}
                          onClick={() => update((d) => setGoalWidth(d, chosenKit.id, w))}
                          className="rounded-[2px] border px-2 py-1 text-[13px] font-semibold"
                          style={{
                            borderColor: on ? "var(--color-ash)" : "var(--color-line-strong)",
                            background: on ? "var(--color-spot-tint)" : "transparent",
                            color: on ? "var(--color-ash)" : "var(--color-ink-dim)",
                          }}
                        >
                          {w === "small" ? "Small" : "Full"}, {GOAL_WIDTHS_M[w]} m
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="mt-3 flex gap-2">
                {chosenKit.kind === "goal" && (
                  <button type="button" className="btn-outline" onClick={() => update((d) => turnGoal(d, chosenKit.id))}>
                    Turn
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    update((d) => removeKit(d, chosenKit.id));
                    setSelected(null);
                  }}
                >
                  Remove
                </button>
              </div>
            </section>
          )}

          {chosen?.kind === "player" && (
            <section>
              <h2 className="section-head title text-[17px]">{describe(chosen)}</h2>
              <label className="mt-3 block">
                <span className="label block">Label on the disc</span>
                <input
                  className="field mt-1.5 w-24"
                  value={chosen.label}
                  maxLength={3}
                  onChange={(e) => update((d) => setLabel(d, chosen.id, e.target.value))}
                />
              </label>
              <p className="caption mt-2">A number, or a position such as FB or HF.</p>
            </section>
          )}

          <section>
            <h2 className="section-head title text-[17px]">Coaching points</h2>
            <textarea
              className="field mt-3 min-h-[8rem] resize-y"
              value={notes}
              maxLength={2000}
              placeholder="What the drill is for, and what to watch for"
              onChange={(e) => {
                setNotes(e.target.value);
                touch();
              }}
            />
          </section>
        </aside>
      </div>
    </main>
  );
}

/** A file name a phone and a laptop both accept, from the drill's title. */
function fileName(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return base || "drill";
}

function canShareFile(file: File): boolean {
  return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
}

function SaveState({ status, onRetry }: { status: Status; onRetry: () => void }) {
  if (status === "error") {
    return (
      <span style={{ color: "var(--color-danger-ink)" }}>
        Not saved.{" "}
        <button type="button" className="font-semibold underline" onClick={onRetry}>
          Try again
        </button>
      </span>
    );
  }
  return (
    <span className="caption text-[13px]" aria-live="polite">
      {status === "saved" ? "Saved" : "Saving…"}
    </span>
  );
}

/** A filled disc for side A, a ring for side B — the same marks as the board. */
function SideSwatch({ side }: { side: DrillSide }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" aria-hidden>
      {side === "a" ? (
        <circle cx={10} cy={10} r={9} fill={SIDE_COLOUR.a} />
      ) : (
        <circle cx={10} cy={10} r={7.5} fill="none" stroke={SIDE_COLOUR.b} strokeWidth={3} />
      )}
    </svg>
  );
}

function Stepper({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (n: number) => void;
}) {
  const btn =
    "inline-flex h-8 w-8 items-center justify-center rounded-[2px] border text-[16px] font-semibold disabled:opacity-40";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={btn}
        style={{ borderColor: "var(--color-line-strong)" }}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
        aria-label={`One fewer for ${label}`}
      >
        −
      </button>
      <span className="figure tabular w-7 text-center text-[18px]" aria-live="polite" aria-label={`${value} players`}>
        {value}
      </span>
      <button
        type="button"
        className={btn}
        style={{ borderColor: "var(--color-line-strong)" }}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={`One more for ${label}`}
      >
        +
      </button>
    </div>
  );
}
