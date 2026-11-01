"use client";

/**
 * The coaches' forms on the opposition pages: adding a game of theirs to
 * study, putting a club on the list ahead of any footage, and on a club's own
 * page renaming it or merging a second spelling into it.
 *
 * Names are typed, with the clubs already listed offered as you type, because
 * a coach knows the name and a picker of sixty clubs is slower than typing
 * four letters. A name that matches one already listed lands on it anyway
 * (src/lib/hurling/opposition.ts), so a slightly different spelling is fine.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addOpposition,
  createOppositionGame,
  mergeOppositions,
  renameOpposition,
} from "@/lib/actions/opposition";
import { HalfLength } from "@/components/stats/HalfLength";

/** Today in the browser's own time zone, as the date input wants it. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mt-3 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
      {text}
    </p>
  );
}

export function OppositionGameForm({
  names,
  team: fixedTeam,
  halfLengthMin: usualHalf,
}: {
  /** Every club already listed, offered as you type. */
  names: string[];
  /** On a club's own page the studied team is that club. */
  team?: string;
  halfLengthMin: number;
}) {
  const router = useRouter();
  const [team, setTeam] = useState(fixedTeam ?? "");
  const [vs, setVs] = useState("");
  const [playedOn, setPlayedOn] = useState(today);
  const [competition, setCompetition] = useState("");
  const [halfLengthMin, setHalfLengthMin] = useState(usualHalf);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = team.trim() && vs.trim() && !pending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      try {
        const { oppositionId } = await createOppositionGame({
          team,
          vs,
          playedOn,
          competition: competition || undefined,
          halfLengthMin,
        });
        setVs("");
        setCompetition("");
        router.push(`/opposition/${oppositionId}`);
        router.refresh();
      } catch (err) {
        setError((err as Error).message || "That game could not be added.");
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded p-4"
      style={{ border: "1px solid var(--color-line-strong)", background: "var(--color-surface)" }}
    >
      <h2 className="title text-base">Add a game to study</h2>
      <p className="caption mt-1">Two other clubs. Upload the footage to it once it is added.</p>
      <datalist id="opposition-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {fixedTeam == null && (
          <div>
            <label className="label mb-1.5 block" htmlFor="opp-team">
              The team you are studying
            </label>
            <input
              id="opp-team"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              list="opposition-names"
              placeholder="Glen Rovers"
              autoComplete="off"
              required
              className="field"
            />
          </div>
        )}
        <div>
          <label className="label mb-1.5 block" htmlFor="opp-vs">
            Who they played
          </label>
          <input
            id="opp-vs"
            value={vs}
            onChange={(e) => setVs(e.target.value)}
            list="opposition-names"
            placeholder="Sars"
            autoComplete="off"
            required
            className="field"
          />
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="opp-date">
            Date
          </label>
          <input
            id="opp-date"
            type="date"
            value={playedOn}
            onChange={(e) => setPlayedOn(e.target.value)}
            required
            className="field tabular"
          />
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="opp-competition">
            Competition <span style={{ color: "var(--color-ink-faint)" }}>(optional)</span>
          </label>
          <input
            id="opp-competition"
            value={competition}
            onChange={(e) => setCompetition(e.target.value)}
            placeholder="County semi-final"
            autoComplete="off"
            className="field"
          />
        </div>
        <div>
          <span className="label mb-1.5 block">Halves</span>
          <HalfLength value={halfLengthMin} onChange={setHalfLengthMin} />
        </div>
      </div>
      <Problem text={error} />
      <button type="submit" disabled={!ready} className="btn-primary mt-4">
        {pending ? "Adding…" : "Add the game"}
      </button>
    </form>
  );
}

/** A club on the list before there is footage of them: next week's opponent. */
export function AddOpposition() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || pending) return;
        setError(null);
        startTransition(async () => {
          try {
            const { id } = await addOpposition(name);
            router.push(`/opposition/${id}`);
          } catch (err) {
            setError((err as Error).message || "That team could not be added.");
          }
        });
      }}
    >
      <label className="label mb-1.5 block" htmlFor="opp-add">
        Add a team
      </label>
      <div className="flex gap-2">
        <input
          id="opp-add"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Next week's opponent"
          autoComplete="off"
          className="field"
        />
        <button type="submit" disabled={!name.trim() || pending} className="btn-outline shrink-0">
          Add
        </button>
      </div>
      <Problem text={error} />
    </form>
  );
}

/**
 * Renaming a club, and merging another spelling of it into this one. Merging
 * cannot be undone, so it asks first, naming both.
 */
export function OppositionTools({
  id,
  name,
  others,
}: {
  id: string;
  name: string;
  others: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(name);
  const [mergeFrom, setMergeFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (err) {
        setError((err as Error).message || "That could not be saved.");
      }
    });
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim() || draft.trim() === name) return;
          run(() => renameOpposition(id, draft));
        }}
      >
        <label className="label mb-1.5 block" htmlFor="opp-rename">
          Name
        </label>
        <div className="flex gap-2">
          <input
            id="opp-rename"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            className="field"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim() || draft.trim() === name}
            className="btn-outline shrink-0"
          >
            Rename
          </button>
        </div>
      </form>

      {others.length > 0 && (
        <div>
          <label className="label mb-1.5 block" htmlFor="opp-merge">
            Another spelling of this club
          </label>
          <div className="flex gap-2">
            <select
              id="opp-merge"
              value={mergeFrom}
              onChange={(e) => setMergeFrom(e.target.value)}
              className="field"
            >
              <option value="">Choose one to merge in</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || !mergeFrom}
              onClick={() => {
                const from = others.find((o) => o.id === mergeFrom);
                if (!from) return;
                if (!confirm(`Merge ${from.name} into ${name}? Its games and clips move here, and ${from.name} leaves the list.`)) {
                  return;
                }
                run(async () => {
                  await mergeOppositions(from.id, id);
                  setMergeFrom("");
                });
              }}
              className="btn-outline shrink-0"
            >
              Merge
            </button>
          </div>
        </div>
      )}
      <Problem text={error} />
    </div>
  );
}
