/**
 * The club's colours as the drill board wears them.
 *
 * An admin picks a primary and a secondary colour on the squad page, the way
 * a jersey has a body and a trim. On the drill board the home side (side A,
 * the filled discs) is drawn in them: primary for the disc, secondary for the
 * ring just inside its edge. The away side keeps the board's own colour, so
 * the two sides still tell apart.
 *
 * Two things are decided here rather than in the drawing code, because both
 * need a test. What counts as a colour (a six-digit hex and nothing else, so
 * a request cannot smuggle a style rule into a stylesheet value), and what
 * colour the number is printed in: a navy disc with a navy-ish secondary
 * would otherwise lose its number, so the number takes the secondary only
 * when it can be read against the primary, and white or near-black when not.
 *
 * Kept free of the database and the DOM so the tests can import it.
 */

export type ClubColours = {
  primary: string | null;
  secondary: string | null;
};

/** What the board draws the home side with. */
export type HomeKit = {
  /** The disc, and the run and arrowhead that go with it. */
  fill: string;
  /** The ring inside the disc's edge; the primary again when no secondary is set. */
  trim: string;
  /** The number on the disc. */
  label: string;
};

const HEX = /^#[0-9a-f]{6}$/;

/** The dark and light the board prints a number in when the secondary cannot be read. */
const NUMBER_DARK = "#111317";
const NUMBER_LIGHT = "#ffffff";

/** WCAG's floor for large or bold text; a number on a disc is both. */
const READABLE = 3;

/** A valid `#rrggbb` in lower case, or null for anything else. */
export function parseColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return HEX.test(v) ? v : null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, 0 for black to 1 for white. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The home side's colours, or null when the club has not chosen a primary
 * and the board keeps its own. A secondary without a primary is ignored: a
 * trim needs a body.
 */
export function homeKit(colours: ClubColours): HomeKit | null {
  const fill = parseColour(colours.primary);
  if (!fill) return null;
  const secondary = parseColour(colours.secondary);

  const readableOn = (c: string) => contrast(c, fill) >= READABLE;
  const plain = contrast(NUMBER_LIGHT, fill) >= contrast(NUMBER_DARK, fill) ? NUMBER_LIGHT : NUMBER_DARK;

  return {
    fill,
    trim: secondary ?? fill,
    label: secondary && readableOn(secondary) ? secondary : plain,
  };
}
