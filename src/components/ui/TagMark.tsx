/**
 * The mark a tag carries beside its name.
 *
 * The same three marks the stat sheet's pitch maps use — filled for good for
 * us, a ring for against us, a dashed ring for unclear — so a clip list, a
 * tag bar and a shot map all speak one language, and all of them still read
 * with the colour taken away. A referee's card is drawn as a card. A tag that
 * is not an outcome gets no mark at all; its name is enough.
 */
import type { TagTone } from "@/lib/hurling/events";

const TONE_COLOUR: Record<TagTone, string> = {
  good: "var(--color-brand)",
  against: "var(--color-danger)",
  unclear: "var(--color-mark)",
  yellow_card: "var(--color-card-yellow)",
  red_card: "var(--color-card-red)",
  plain: "var(--color-ink-faint)",
};

/** For marks that cannot carry a shape — a tick on a timeline strip. */
export function toneColour(tone: TagTone): string {
  return TONE_COLOUR[tone];
}

export function TagMark({ tone, size = 8 }: { tone: TagTone; size?: number }) {
  if (tone === "plain") return null;
  const colour = TONE_COLOUR[tone];

  if (tone === "yellow_card" || tone === "red_card") {
    return (
      <span
        aria-hidden
        className="inline-block shrink-0"
        style={{
          width: Math.round(size * 0.75),
          height: Math.round(size * 1.05),
          background: colour,
          borderRadius: 1,
          boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-ink) 30%, transparent)",
        }}
      />
    );
  }

  // SVG rather than a CSS border: a dashed border on an 8px circle breaks
  // into blobs, where a stroked circle keeps the pitch map's even dashes.
  const filled = tone === "good";
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 10 10" className="shrink-0">
      <circle
        cx={5}
        cy={5}
        r={filled ? 5 : 4}
        fill={filled ? colour : "none"}
        stroke={filled ? "none" : colour}
        strokeWidth={filled ? 0 : 2}
        strokeDasharray={tone === "unclear" ? "2.6 2" : undefined}
      />
    </svg>
  );
}
