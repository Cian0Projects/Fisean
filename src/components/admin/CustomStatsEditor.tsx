"use client";

/**
 * Where a coach or admin defines the squad's own stats.
 *
 * The built-in sheet covers what every club counts. This is for what one
 * squad counts that the sheet has no heading for, so the form is a short menu
 * of the things a stat can ask, and the preview under it is the form the
 * coach is making, in the order it will be asked. Nothing here is a free-form
 * schema on purpose: every option is something the logging forms can draw and
 * the report can total (src/lib/hurling/custom-stats.ts).
 *
 * Retiring a stat takes it off the logging screens but keeps its history on
 * every report; deleting one takes the history with it, so that asks first.
 */
import { useState, useTransition } from "react";
import {
  createCustomStat,
  deleteCustomStat,
  setCustomStatRetired,
  setRestartLine,
  setStandardStatRemoved,
  updateCustomStat,
} from "@/lib/actions/custom-stats";
import { RESTART_LINES, defaultRestartLine, lineName, type RestartLine } from "@/lib/hurling/restart-line";
import { statVocabulary, type StatType } from "@/lib/hurling/stats";
import {
  canRemoveStandard,
  CUSTOM_NAME_MAX,
  CUSTOM_POINT_LABELS,
  CUSTOM_SCORE_MODES,
  CUSTOM_SCORE_MODE_LABELS,
  CUSTOM_SIDE_MODES,
  CUSTOM_SIDE_MODE_LABELS,
  DEFAULT_SPEC,
  MAX_CUSTOM_STATS,
  specQuestions,
  type CustomStatDef,
  type CustomStatSpec,
} from "@/lib/hurling/custom-stats";
import type { GameCode } from "@/lib/hurling/codes";
import { Check, Choice } from "@/components/stats/StatFields";
import { errorText } from "@/lib/user-error";

export function CustomStatsEditor({
  initial,
  hidden,
  code,
  restartLine,
}: {
  initial: CustomStatDef[];
  /** Standard stats this squad has removed. */
  hidden: StatType[];
  code: GameCode;
  /** Advanced puckout analysis: the line, or null when off. */
  restartLine: RestartLine | null;
}) {
  const [stats, setStats] = useState(initial);
  // The form is closed, making a new stat (null), or changing one (its id).
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const full = stats.length >= MAX_CUSTOM_STATS;
  const upsert = (saved: CustomStatDef) =>
    setStats((prev) => (prev.some((s) => s.id === saved.id) ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved]));

  const retire = (stat: CustomStatDef, retired: boolean) => {
    setError(null);
    startTransition(async () => {
      try {
        upsert(await setCustomStatRetired(stat.id, retired));
      } catch (err) {
        setError(errorText(err, "That stat could not be changed."));
      }
    });
  };

  const remove = (stat: CustomStatDef) => {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCustomStat(stat.id);
        setStats((prev) => prev.filter((s) => s.id !== stat.id));
        setConfirmingId(null);
      } catch (err) {
        setError(errorText(err, "That stat could not be deleted."));
      }
    });
  };

  return (
    <section>
      <div className="section-head mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="title text-xl">Our own stats</h2>
          {editing === null && (
            <button onClick={() => setEditing("new")} disabled={full} className="btn-outline text-xs disabled:opacity-40">
              Add a stat
            </button>
          )}
        </div>
        <p className="caption measure mt-1">
          Count what the standard sheet does not: a breakdown ball won, a runner released, a restart we pressed. Each
          one is logged beside the match stats, live or from footage, and gets its own section on the report.
        </p>
      </div>

      {error && (
        <p className="mb-3 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}

      {editing !== null && (
        <StatForm
          key={editing}
          code={code}
          stat={editing === "new" ? null : (stats.find((s) => s.id === editing) ?? null)}
          onSaved={(saved) => {
            upsert(saved);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {stats.length === 0 && editing === null ? (
        <p className="py-4 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
          None yet. Add one and it shows up as a tab when you log a match.
        </p>
      ) : (
        <ul>
          {stats.map((stat) => {
            const retired = stat.archivedAt != null;
            const questions = specQuestions(stat, code);
            return (
              <li
                key={stat.id}
                className="fixture border-b py-3"
                style={{ borderColor: "var(--color-line)", opacity: retired ? 0.6 : 1 }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <span className="text-[16px] font-medium">{stat.name}</span>
                    {retired && (
                      <span className="ml-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        Retired
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1 text-[12px]">
                    <button onClick={() => setEditing(stat.id)} className="px-1" style={{ color: "var(--color-ink-dim)" }}>
                      Edit
                    </button>
                    <button
                      onClick={() => retire(stat, !retired)}
                      disabled={pending}
                      className="px-1"
                      style={{ color: "var(--color-ink-dim)" }}
                    >
                      {retired ? "Bring back" : "Retire"}
                    </button>
                    <button
                      onClick={() => setConfirmingId(confirmingId === stat.id ? null : stat.id)}
                      className="px-1"
                      style={{ color: "var(--color-danger-ink)" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                  {questions.length === 0 ? "A simple tally, no questions" : "Asks " + questions.map(lowerFirst).join(", ")}
                </p>
                {confirmingId === stat.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                    <span>Delete it and everything logged against it in every match?</span>
                    <button
                      onClick={() => remove(stat)}
                      disabled={pending}
                      className="rounded px-2 py-1 text-[12px] font-semibold"
                      style={{ background: "var(--color-danger)", color: "#fff" }}
                    >
                      Yes, delete it
                    </button>
                    <button onClick={() => setConfirmingId(null)} className="btn-ghost px-2 py-1 text-[12px]">
                      Keep it
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {full && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          A squad can have {MAX_CUSTOM_STATS} stats of its own. Delete one you no longer use to add another.
        </p>
      )}

      <StandardStats initial={hidden} code={code} />
      <RestartAnalysis initial={restartLine} code={code} />
    </section>
  );
}

/**
 * The standard stats, with a way to take off the ones this squad never logs.
 * Removing only hides: the logging screens stop offering it and the report
 * drops its section once nothing is logged under it, but anything already
 * logged is kept, so bringing it back loses nothing.
 */
function StandardStats({ initial, code }: { initial: StatType[]; code: GameCode }) {
  const [hidden, setHidden] = useState<StatType[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const vocabulary = statVocabulary(code);

  const toggle = (type: StatType, removed: boolean) => {
    setError(null);
    startTransition(async () => {
      try {
        setHidden(await setStandardStatRemoved(type, removed));
      } catch (err) {
        setError(errorText(err, "That stat could not be changed."));
      }
    });
  };

  return (
    <div className="mt-8">
      <h3 className="title text-base">Standard stats</h3>
      <p className="caption measure mt-1">
        Take off any your squad never logs. They leave the logging screens, and leave the report once nothing is logged
        under them. What is already logged is kept, and you can bring one back whenever you like.
      </p>
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
      <ul className="mt-2">
        {vocabulary.statTypes.map((type) => {
          const removed = hidden.includes(type);
          const allowed = canRemoveStandard(vocabulary.statTypes, hidden, type);
          return (
            <li
              key={type}
              className="flex items-baseline justify-between gap-3 border-b py-2"
              style={{ borderColor: "var(--color-line)", opacity: removed ? 0.6 : 1 }}
            >
              <span className="text-[15px]">
                {vocabulary.meta[type].label}
                {removed && (
                  <span className="ml-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                    Removed
                  </span>
                )}
              </span>
              <button
                onClick={() => toggle(type, !removed)}
                disabled={pending || !allowed}
                title={allowed ? undefined : "Keep at least one standard stat"}
                className="px-1 text-[12px] disabled:opacity-40"
                style={{ color: removed ? "var(--color-ink-dim)" : "var(--color-danger-ink)" }}
              >
                {removed ? "Bring back" : "Remove"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Advanced puckout analysis, switched on per squad: off unless a coach wants
 * it, because most squads are well served by who won each restart. On, a
 * short restart is judged by whether it was worked out past one line, and
 * the line starts where the code plays its short game (`defaultRestartLine`).
 */
function RestartAnalysis({ initial, code }: { initial: RestartLine | null; code: GameCode }) {
  const [line, setLine] = useState<RestartLine | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { restart, restarts } = statVocabulary(code).terms;
  const said = lowerFirst(restart);

  const save = (next: RestartLine | null) => {
    const before = line;
    setLine(next);
    setError(null);
    startTransition(async () => {
      try {
        await setRestartLine(next);
      } catch (err) {
        setLine(before);
        setError(errorText(err, "The line could not be saved."));
      }
    });
  };

  return (
    <div className="mt-8">
      <h3 className="title text-base">Advanced {said} analysis</h3>
      <p className="caption measure mt-1">
        Judge every short {said}, ours and theirs, by whether it was worked out past a line. Logging asks one more
        thing after a short one is won, and the next entry often answers it. The report then shows how many were lost on
        the first ball, lost before the line, lost past it, or worked through. Off, {lowerFirst(restarts)} are logged
        as they always have been.
      </p>
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
      <div className="mt-3 space-y-3">
        <Check
          checked={line !== null}
          onChange={(on) => save(on ? defaultRestartLine(code) : null)}
          label={`Judge short ${lowerFirst(restarts)} at a line`}
        />
        {line !== null && (
          <Choice
            label={`Judge short ${lowerFirst(restarts)} at`}
            options={RESTART_LINES.map((l) => {
              const name = lineName(l, "us");
              return { value: l, label: name.charAt(0).toUpperCase() + name.slice(1) };
            })}
            value={line}
            onChange={(v) => !pending && save(v as RestartLine)}
          />
        )}
      </div>
    </div>
  );
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function StatForm({
  stat,
  code,
  onSaved,
  onCancel,
}: {
  stat: CustomStatDef | null;
  code: GameCode;
  onSaved: (saved: CustomStatDef) => void;
  onCancel: () => void;
}) {
  const [spec, setSpec] = useState<CustomStatSpec>(stat ?? DEFAULT_SPEC);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const patch = (p: Partial<CustomStatSpec>) => setSpec((s) => ({ ...s, ...p }));
  const questions = specQuestions(spec, code);

  const save = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        onSaved(stat ? await updateCustomStat(stat.id, spec) : await createCustomStat(spec));
      } catch (err) {
        setError(errorText(err, "That stat could not be saved."));
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="mb-6 space-y-5 rounded border p-4"
      style={{ borderColor: "var(--color-line-strong)", background: "var(--color-surface)" }}
    >
      <div>
        <label className="label mb-1.5 block" htmlFor="custom-stat-name">
          Name
        </label>
        <input
          id="custom-stat-name"
          value={spec.name}
          onChange={(e) => patch({ name: e.target.value })}
          maxLength={CUSTOM_NAME_MAX}
          placeholder="Breakdown ball won"
          autoComplete="off"
          autoFocus
          className="field w-full max-w-sm"
        />
      </div>

      <Choice
        label="Whose is it"
        value={spec.sideMode}
        onChange={(v) => patch({ sideMode: v as CustomStatSpec["sideMode"] })}
        options={CUSTOM_SIDE_MODES.map((m) => ({ value: m, label: CUSTOM_SIDE_MODE_LABELS[m] }))}
        note="Pick Either when you count it for both teams, and you are asked each time you log one."
      />

      <div className="space-y-2.5">
        <span className="label block">Who is involved</span>
        <Check
          checked={spec.askPlayer}
          onChange={(askPlayer) => patch({ askPlayer })}
          label="Ask for our player's number"
        />
        <Check
          checked={spec.askOpposition}
          onChange={(askOpposition) => patch({ askOpposition })}
          label="Ask for their player's number"
        />
        <Check
          checked={spec.askOutcome}
          onChange={(askOutcome) => patch({ askOutcome })}
          label="Ask how it went: good for us, against us or unclear"
        />
      </div>

      <Choice
        label="Is a score involved"
        value={spec.scoreMode}
        onChange={(v) => patch({ scoreMode: v as CustomStatSpec["scoreMode"] })}
        options={CUSTOM_SCORE_MODES.map((m) => ({ value: m, label: CUSTOM_SCORE_MODE_LABELS[m] }))}
        note="This is recorded against the stat only. It never adds to the match score, so a shot is still logged as a shot."
      />

      <Choice
        label="Where it happens"
        value={String(spec.points)}
        onChange={(v) => patch({ points: Number(v) as CustomStatSpec["points"] })}
        options={([0, 1, 2] as const).map((p) => ({ value: String(p), label: CUSTOM_POINT_LABELS[p] }))}
      />

      <div className="border-t pt-4" style={{ borderColor: "var(--color-line)" }}>
        <span className="label mb-1.5 block">When you log it, you are asked</span>
        {questions.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            Nothing. It is a tally you tap once for each one.
          </p>
        ) : (
          <ol className="list-decimal space-y-0.5 pl-5 text-[14px]">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        )}
      </div>

      {error && (
        <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending || !spec.name.trim()} className="btn-primary text-sm">
          {stat ? "Save changes" : "Add the stat"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}
