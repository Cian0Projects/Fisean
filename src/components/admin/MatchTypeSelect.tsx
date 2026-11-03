"use client";

/**
 * Pick what kind of match it was. One control for the upload dialog, the link
 * import and the Edit on a match row, so the choices never drift apart. A match
 * that already holds a competition typed elsewhere keeps it as the first
 * choice (see typesFor), so opening Edit never silently changes it.
 */
import { typesFor } from "@/lib/hurling/match-type";

export function MatchTypeSelect({
  id,
  value,
  current,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  /** What the match holds now, if it is not one of the usual types. */
  current?: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="field">
      {typesFor(current).map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
