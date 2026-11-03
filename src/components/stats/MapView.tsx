"use client";

/**
 * How a section's maps are drawn: by half, the way the game was played, or all
 * of it in one.
 *
 * Positions are stored normalised so we attack the same way in both halves, but
 * the teams swap ends at the break, so a map that shows the second half the same
 * way round as the first reads backwards against what happened. By half, the
 * second half is turned (our end on the right), for both our entries and theirs.
 * "Full game" puts every entry on one pitch, all in the stored direction, which
 * is what a pattern across the whole match needs.
 *
 * One state per section, shared by every map in it, so the two sides of a
 * comparison always change together. The server works out what each map shows
 * and passes the marks over; this only chooses between them. The toggle is
 * screen only: a printed page is whichever view was on screen.
 */
import { createContext, useContext, useState } from "react";
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import type { GameCode } from "@/lib/hurling/codes";

type View = "halves" | "full";

const ViewContext = createContext<{ view: View; setView: (v: View) => void } | null>(null);

export function MapViewProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<View>("halves");
  return <ViewContext.Provider value={{ view, setView }}>{children}</ViewContext.Provider>;
}

/** The button that switches every map in its section. */
export function MapViewToggle() {
  const ctx = useContext(ViewContext);
  if (!ctx) return null;
  const options: { value: View; label: string }[] = [
    { value: "halves", label: "By half" },
    { value: "full", label: "Full game" },
  ];
  return (
    <div role="group" aria-label="How the maps are drawn" className="no-print flex gap-1">
      {options.map((o) => {
        const on = ctx.view === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => ctx.setView(o.value)}
            aria-pressed={on}
            className="rounded-[2px] border px-2.5 py-1 text-[12px] font-semibold"
            style={{
              borderColor: on ? "var(--color-ash)" : "var(--color-line)",
              background: on ? "var(--color-spot-tint)" : "transparent",
              color: on ? "var(--color-ash)" : "var(--color-ink-dim)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** One pitch: what it is headed, how many it holds, and whether it is turned. */
export type MapGroup = {
  title: string;
  /** "9 logged", or "7 of 9 placed". */
  count: string;
  marks: PitchMark[];
  turned: boolean;
};

/**
 * The maps themselves. `halves` is one pitch per half; `full` is the one-pitch
 * version, absent where the entries carry no halves and there is nothing to
 * combine.
 */
export function MapGroups({
  halves,
  full,
  code,
  stacked = false,
  level = 3,
}: {
  halves: MapGroup[];
  full: MapGroup | null;
  code: GameCode;
  stacked?: boolean;
  /** The heading level the pitch titles take, so a block in a deeper heading stays in order. */
  level?: 3 | 4;
}) {
  const ctx = useContext(ViewContext);
  const groups = ctx?.view === "full" && full ? [full] : halves;
  const Heading = level === 4 ? "h4" : "h3";
  return (
    <div className={`grid gap-6 ${stacked ? "" : "md:grid-cols-2"}`}>
      {groups.map((g) => (
        <figure key={g.title} className="m-0">
          <figcaption className="mb-2 flex items-baseline justify-between gap-2">
            <Heading className="title text-[14px]">{g.title}</Heading>
            <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {g.count}
            </span>
          </figcaption>
          <PitchMap marks={g.marks} code={code} turned={g.turned} />
        </figure>
      ))}
    </div>
  );
}
