"use client";

import { useState, useTransition } from "react";
import { setClubColours } from "@/lib/actions/admin";
import { homeKit, parseColour } from "@/lib/hurling/kit";
import { orgTerms, type OrgKind } from "@/lib/hurling/org";

/** What the pickers show before a club has chosen: the board's own blue and a plain white. */
const PICKER_PRIMARY = "#1f2f96";
const PICKER_SECONDARY = "#ffffff";

/**
 * The club's jersey colours, for the admin on the squad page. The drill board
 * draws the home side in them, so a coach sees their own club's colours on
 * the pitch. Held as a draft and saved with a button rather than on every
 * movement of the picker, which fires continuously as it is dragged. Saving
 * writes to every team in the club, as the badge does.
 */
export function ClubColours({
  initial,
  kind,
}: {
  initial: { primary: string | null; secondary: string | null };
  kind: OrgKind;
}) {
  const { noun, Noun } = orgTerms(kind);
  const [saved, setSaved] = useState(initial);
  const [primary, setPrimary] = useState(initial.primary);
  const [secondary, setSecondary] = useState(initial.secondary);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changed = primary !== saved.primary || (primary !== null && secondary !== saved.secondary);
  const kit = homeKit({ primary, secondary });

  function save(next: { primary: string | null; secondary: string | null }) {
    setNote(null);
    startTransition(async () => {
      const result = await setClubColours(next);
      if ("error" in result) {
        setNote(result.error);
        return;
      }
      setSaved(result);
      setPrimary(result.primary);
      setSecondary(result.secondary);
      setNote(
        result.primary
          ? "Saved. Your home side wears these on the drill board."
          : "Cleared. The drill board uses its own colours.",
      );
    });
  }

  return (
    <section>
      <div className="section-head mb-4">
        <h2 className="title text-xl">{Noun} colours</h2>
        <p className="caption measure mt-1">
          Your primary and secondary colours. The home side on the drill board, in the editor, the
          drill book and the exported video, is drawn in them. Each team in the {noun} shares them.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <Picker
          id="club-primary"
          label="Primary"
          value={primary ?? PICKER_PRIMARY}
          set={primary !== null}
          onChange={(v) => setPrimary(parseColour(v))}
        />
        <Picker
          id="club-secondary"
          label="Secondary"
          value={secondary ?? PICKER_SECONDARY}
          set={secondary !== null}
          disabled={primary === null}
          onChange={(v) => setSecondary(parseColour(v))}
        />
        <Preview kit={kit} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-outline"
          disabled={pending || !changed}
          onClick={() => save({ primary, secondary })}
        >
          {pending ? "Saving…" : "Save colours"}
        </button>
        {(saved.primary !== null || primary !== null) && (
          <button
            type="button"
            className="text-[13px] underline"
            disabled={pending}
            onClick={() => save({ primary: null, secondary: null })}
          >
            Clear
          </button>
        )}
      </div>
      {primary === null && (
        <p className="caption mt-2">Pick a primary colour to start. Until then the board uses its own.</p>
      )}
      {note && (
        <p className="caption mt-2" aria-live="polite">
          {note}
        </p>
      )}
    </section>
  );
}

function Picker({
  id,
  label,
  value,
  set,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  /** Whether a colour has been chosen, as opposed to the picker's resting value. */
  set: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2.5">
        <input
          id={id}
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer border p-0.5"
          style={{
            borderColor: "var(--color-line-strong)",
            background: "transparent",
            borderRadius: 2,
            opacity: set ? 1 : 0.55,
          }}
        />
        <span className="tabular text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
          {set ? value : "Not set"}
        </span>
      </div>
    </div>
  );
}

/** A home disc as the board draws it, beside an away ring, so the choice reads at once. */
function Preview({ kit }: { kit: ReturnType<typeof homeKit> }) {
  const fill = kit?.fill ?? "var(--color-side-a)";
  const trim = kit?.trim ?? fill;
  const label = kit?.label ?? "var(--color-stage)";
  return (
    <svg viewBox="0 0 84 40" className="h-10 w-[5.25rem] shrink-0" role="img" aria-label="Preview of the home and away players">
      <circle cx={20} cy={20} r={17} fill={fill} />
      <circle cx={20} cy={20} r={14} fill="none" stroke={trim} strokeWidth={2.2} />
      <text
        x={20}
        y={25.5}
        textAnchor="middle"
        fontSize={16}
        fontWeight="700"
        fontFamily="var(--font-sans)"
        fill={label}
      >
        7
      </text>
      <circle cx={62} cy={20} r={14.5} fill="none" stroke="var(--color-side-b)" strokeWidth={4} />
      <text
        x={62}
        y={25.5}
        textAnchor="middle"
        fontSize={16}
        fontWeight="700"
        fontFamily="var(--font-sans)"
        fill="var(--color-ink)"
      >
        7
      </text>
    </svg>
  );
}
