/**
 * The match summary: every stat a squad logs on one screen, each judged
 * against the target the squad set for it.
 *
 * Two pages read this. The management view shows a compact tile for every
 * stat; the player view shows the score timeline, two tiles the squad always
 * wants in front of the players (`resolvePins`), and one or two more the app
 * suggests and the analyst confirms (`suggestTiles`). Both work at half time,
 * on the first half alone, and at full time, on the whole match with each
 * half underneath.
 *
 * The menu of tiles is not a list kept here. It is the squad's own logging
 * setup: every standard stat it has not hidden, and every stat of its own.
 * A stat added to the logger gets a tile without anyone touching this file.
 *
 * A target is one number per stat: a count ("at least 40 tackles") or a rate
 * ("at least 55% of shots scored"), at least or at most. A rate reads the
 * same at any point in a match. A count is for the whole match, so half of
 * it is what a half is judged against, rounded the way that has to be met
 * with whole numbers. How far a stat is from its target is measured
 * relatively, so two tackles short of ten ranks with 44% against 55%.
 *
 * Everything here is pure, so it is tested: tests/summary.test.mjs.
 */
import {
  chronological,
  isScore,
  percentOf,
  puckoutBreakdown,
  resultValue,
  shotSide,
  summariseShooting,
  statVocabulary,
  type Half,
  type Side,
  type StatEntry,
  type StatType,
} from "./stats";
import type { CustomStatDef, CustomValues } from "./custom-stats";
import { zoneForX } from "./pitch";
import { formatScore } from "./notation";
import type { GameCode } from "./codes";

/* ------------------------------------------------------------ vocabulary */

export const TARGET_MEASURES = ["count", "rate"] as const;
export type TargetMeasure = (typeof TARGET_MEASURES)[number];

export const TARGET_DIRECTIONS = ["at_least", "at_most"] as const;
export type TargetDirection = (typeof TARGET_DIRECTIONS)[number];

export const TARGET_DIRECTION_LABELS: Record<TargetDirection, string> = {
  at_least: "At least",
  at_most: "At most",
};

export const TARGET_MEASURE_LABELS: Record<TargetMeasure, string> = {
  count: "Count",
  rate: "Rate",
};

/** Half time judges the first half; full time the whole match, with each half under it. */
export const SUMMARY_STAGES = ["half_time", "full_time"] as const;
export type SummaryStage = (typeof SUMMARY_STAGES)[number];

export const STAGE_LABELS: Record<SummaryStage, string> = {
  half_time: "Half time",
  full_time: "Full time",
};

/**
 * A tile is a standard stat, by its type, or one of the squad's own, by
 * `custom:<id>`. One string, so a target, a pin and a pick are all keyed the
 * same way and stored in one column.
 */
export type TileKey = string;

const CUSTOM_PREFIX = "custom:";

export function customKey(id: string): TileKey {
  return `${CUSTOM_PREFIX}${id}`;
}

export function customIdOf(key: TileKey): string | null {
  return key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) || null : null;
}

/** `value` is null when the squad has said this stat has no target. */
export type Target = { measure: TargetMeasure; direction: TargetDirection; value: number | null };

/** The largest a count target can be, and a rate is a whole percentage. */
export const MAX_COUNT_TARGET = 999;

/** The two tiles a squad gets on the player view until it picks its own. */
export const DEFAULT_PINS: readonly TileKey[] = ["tackle", "shot"];

/** Up to this many tiles the app suggests beside the two fixed ones. */
export const MAX_PICKS = 2;

/**
 * Within this share of the target counts as close: amber, not red. A tenth
 * is about one score in a half, or one tackle short of ten.
 */
export const CLOSE_GAP = 0.1;

/**
 * A rate on fewer attempts than this is not suggested: three shots from
 * three is not a story worth a dressing room's attention.
 */
export const MIN_RATE_EVENTS = 6;

/**
 * Any miss of a target of nought, "concede no goals", ranks as far off as
 * anything can. A finite number rather than -Infinity, because tiles travel
 * to the browser as JSON, which has no infinity.
 */
export const ZERO_TARGET_MISS = -1000;

/* --------------------------------------------------- what each stat counts */

type StandardSpec = {
  /** What it can be judged by. The first is the default. */
  measures: readonly TargetMeasure[];
  direction: TargetDirection;
};

/**
 * Tackles, frees and marks have no won or lost to them, so they are only
 * ever counted. A shot has no outcome either, but it scores or it does not,
 * which is the rate a coach means by shooting.
 */
const STANDARD: Record<StatType, StandardSpec> = {
  tackle: { measures: ["count"], direction: "at_least" },
  delivery: { measures: ["rate", "count"], direction: "at_least" },
  turnover: { measures: ["count", "rate"], direction: "at_least" },
  shot: { measures: ["rate", "count"], direction: "at_least" },
  free_conceded: { measures: ["count"], direction: "at_most" },
  puckout: { measures: ["rate", "count"], direction: "at_least" },
  free_won: { measures: ["count"], direction: "at_least" },
  mark: { measures: ["count"], direction: "at_least" },
};

/**
 * Where a club with nothing set starts, so the colours mean something from
 * its first match. Rough on purpose: the squad sets its own in stats
 * settings. Football is busier with the ball in hand, so more tackles and
 * turnovers, and a kick-out is easier kept than a poc amach.
 */
function defaultValue(type: StatType, measure: TargetMeasure, code: GameCode): number {
  const football = code === "football" || code === "ladies_football";
  if (measure === "rate") {
    if (type === "shot") return football ? 50 : 55;
    if (type === "puckout") return football ? 75 : 65;
    if (type === "turnover") return 50;
    return 60;
  }
  switch (type) {
    case "tackle":
      return football ? 50 : 40;
    case "turnover":
      return football ? 25 : 20;
    case "free_conceded":
      return 10;
    case "free_won":
      return 10;
    case "mark":
      return 8;
    case "shot":
      return football ? 18 : 22;
    case "puckout":
      return 15;
    case "delivery":
      return 15;
  }
}

/** The measures a tile can be judged by: a custom stat's rate only where it asks how it went. */
export function measuresFor(key: TileKey, custom: readonly Pick<CustomStatDef, "id" | "askOutcome">[]): TargetMeasure[] {
  const id = customIdOf(key);
  if (id) {
    const def = custom.find((d) => d.id === id);
    return def?.askOutcome ? ["count", "rate"] : ["count"];
  }
  return [...(STANDARD[key as StatType]?.measures ?? ["count"])];
}

/** The target a squad starts with for a stat. A stat of its own has none until a coach sets one. */
export function defaultTarget(key: TileKey, code: GameCode): Target {
  if (customIdOf(key)) return { measure: "count", direction: "at_least", value: null };
  const spec = STANDARD[key as StatType];
  if (!spec) return { measure: "count", direction: "at_least", value: null };
  const measure = spec.measures[0];
  return { measure, direction: spec.direction, value: defaultValue(key as StatType, measure, code) };
}

/**
 * A target as it will be used: what was saved, or the default; a measure the
 * stat cannot be judged by falls back to one it can (a custom stat that
 * stopped asking how it went, say).
 */
export function targetFor(
  key: TileKey,
  saved: ReadonlyMap<TileKey, Target>,
  code: GameCode,
  custom: readonly Pick<CustomStatDef, "id" | "askOutcome">[],
): Target {
  const target = saved.get(key) ?? defaultTarget(key, code);
  const measures = measuresFor(key, custom);
  if (measures.includes(target.measure)) return target;
  return { ...target, measure: measures[0], value: null };
}

/** A target's number, kept in range, or a refusal worded for the coach. */
export function targetValue(measure: TargetMeasure, value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) throw new Error("A target is a number, nought or more.");
  const whole = Math.round(n);
  if (measure === "rate" && whole > 100) throw new Error("A rate target is a percentage, 100 at most.");
  if (measure === "count" && whole > MAX_COUNT_TARGET) throw new Error("That target is too big to mean anything.");
  return whole;
}

/* ---------------------------------------------------------------- the menu */

export type TileDef = {
  key: TileKey;
  /** The tile's heading: "Shooting", "Kick-outs", "Breaks won". */
  title: string;
};

/**
 * Every tile this squad's summary has, in logging order: its standard stats
 * not hidden, then its own stats not retired. A hidden or retired stat still
 * gets a tile in a match where something was logged under it, as the report
 * keeps its section.
 */
export function summaryMenu(
  code: GameCode,
  hidden: readonly StatType[],
  custom: readonly Pick<CustomStatDef, "id" | "name" | "archivedAt">[],
  logged: { types: ReadonlySet<StatType>; customIds: ReadonlySet<string> } = { types: new Set(), customIds: new Set() },
): TileDef[] {
  const vocabulary = statVocabulary(code);
  const standard = vocabulary.statTypes
    .filter((t) => !hidden.includes(t) || logged.types.has(t))
    .map((t) => ({ key: t, title: standardTitle(t, code) }));
  const own = custom
    .filter((d) => d.archivedAt == null || logged.customIds.has(d.id))
    .map((d) => ({ key: customKey(d.id), title: d.name }));
  return [...standard, ...own];
}

function standardTitle(type: StatType, code: GameCode): string {
  if (type === "shot") return "Shooting";
  return statVocabulary(code).meta[type].plural;
}

/** What the headline number is, said under it: "Shots scored", "Tackles made". */
export function headlineCaption(key: TileKey, measure: TargetMeasure, code: GameCode, title: string): string {
  if (customIdOf(key)) return measure === "rate" ? `${title}, good for us` : title;
  const restarts = statVocabulary(code).terms.restarts;
  const own = `Own ${restarts.charAt(0).toLowerCase()}${restarts.slice(1)} kept`;
  switch (key as StatType) {
    case "shot":
      return measure === "rate" ? "Shots scored" : "Scores";
    case "tackle":
      return "Tackles made";
    case "delivery":
      return "Deliveries won";
    case "turnover":
      return measure === "rate" ? "Share of turnovers won" : "Turnovers won";
    case "free_conceded":
      return "Frees conceded";
    case "puckout":
      return own;
    case "free_won":
      return "Frees won";
    case "mark":
      return "Marks won";
  }
  return title;
}

/* ----------------------------------------------------------------- figures */

/**
 * A tile's number for one stretch of the match. A count is `part`; a rate is
 * `part` of `whole`, with `value` its whole percentage, or null when there
 * was nothing to divide.
 */
export type Figure = { value: number | null; part: number; whole: number | null };

export type SummaryRow = StatEntry & { half?: number | null; gameMs?: number | null; createdAt: number };
export type SummaryCustom = { def: CustomStatDef; entries: readonly CustomValues[] };

function count(part: number): Figure {
  return { value: part, part, whole: null };
}

function rate(part: number, whole: number): Figure {
  return { value: whole === 0 ? null : percentOf(part, whole), part, whole };
}

/** The rows of one stat that are ours to count: our shots, our restarts, our marks. */
export function tileRows<T extends SummaryRow>(type: StatType, rows: readonly T[]): T[] {
  const of = rows.filter((r) => r.statType === type);
  if (type === "shot") return of.filter((r) => r.shotResult && shotSide(r) === "us");
  if (type === "puckout") return of.filter((r) => r.puckoutTakenBy === "us");
  if (type === "mark") return of.filter((r) => shotSide(r) === "us");
  return of;
}

function standardFigure(type: StatType, measure: TargetMeasure, rows: readonly SummaryRow[]): Figure {
  const mine = tileRows(type, rows);
  switch (type) {
    case "shot": {
      const scored = mine.filter((r) => isScore(r.shotResult)).length;
      return measure === "rate" ? rate(scored, mine.length) : count(scored);
    }
    case "delivery":
    case "turnover": {
      const won = mine.filter((r) => r.outcome === "positive").length;
      if (measure === "count") return count(won);
      // A turnover's share counts won against lost; an unclear one was neither.
      const whole = type === "turnover" ? mine.filter((r) => r.outcome === "positive" || r.outcome === "negative").length : mine.length;
      return rate(won, whole);
    }
    case "puckout": {
      const b = puckoutBreakdown(rows, "us");
      return measure === "rate" ? rate(b.retained, b.taken) : count(b.retained);
    }
    default:
      return count(mine.length);
  }
}

/** The entries of a custom stat that are its to count: theirs for a stat about them, ours otherwise. */
function customMine(def: CustomStatDef, entries: readonly CustomValues[]): CustomValues[] {
  const side: Side = def.sideMode === "opposition" ? "opposition" : "us";
  return entries.filter((e) => e.side === side);
}

function customFigure(def: CustomStatDef, measure: TargetMeasure, entries: readonly CustomValues[]): Figure {
  const mine = customMine(def, entries);
  if (measure === "rate") {
    const judged = mine.filter((e) => e.outcome != null);
    return rate(judged.filter((e) => e.outcome === "positive").length, judged.length);
  }
  return count(mine.length);
}

/* ----------------------------------------------------------- the judging */

export type Verdict = "met" | "close" | "missed" | "untargeted" | "no_data" | "waiting";

/**
 * The target a stretch of the match is judged against. A rate is the same
 * for any stretch. A count is for the whole match, so a half gets half of
 * it, rounded the way it has to be met with whole numbers: "at least 9" is
 * at least 5 by half time, "at most 9" at most 4.
 */
export function goalFor(target: Target, scope: "match" | "half"): number | null {
  if (target.value == null) return null;
  if (target.measure === "rate" || scope === "match") return target.value;
  const half = target.value / 2;
  return target.direction === "at_least" ? Math.ceil(half) : Math.floor(half);
}

/**
 * How far a figure is from its goal, as a share of the goal: nought exactly
 * on it, positive better than it, negative short of it. Relative, so a stat
 * counted in tens and one counted in ones rank on the same scale.
 */
export function relativeGap(actual: number, goal: number, direction: TargetDirection): number {
  if (goal === 0) {
    if (direction === "at_least") return 0;
    return actual === 0 ? 0 : ZERO_TARGET_MISS;
  }
  return direction === "at_least" ? (actual - goal) / goal : (goal - actual) / goal;
}

export function verdictOf(gap: number): "met" | "close" | "missed" {
  if (gap >= 0) return "met";
  return gap >= -CLOSE_GAP ? "close" : "missed";
}

export type Judged = { figure: Figure; goal: number | null; verdict: Verdict; gap: number | null };

function judge(figure: Figure, target: Target, scope: "match" | "half", logged: boolean): Judged {
  const goal = goalFor(target, scope);
  if (!logged || figure.value == null) return { figure, goal, verdict: "no_data", gap: null };
  if (goal == null) return { figure, goal, verdict: "untargeted", gap: null };
  const gap = relativeGap(figure.value, goal, target.direction);
  return { figure, goal, verdict: verdictOf(gap), gap };
}

/* ------------------------------------------------------------------- tiles */

export type TileResult = TileDef & {
  target: Target;
  caption: string;
  /** The judged headline: the first half at half time, the whole match at full time. */
  headline: Judged;
  /** Full time only: each half against half the target. */
  halves: { half: Half; judged: Judged }[] | null;
  /** Unjudged figures under the headline, at most three short lines. */
  supporting: string[];
  /** How many entries the tile is counted from, in the stretch shown. */
  events: number;
  /** Loggers whose entries for this stat are still drafts, by name. */
  waitingOn: string[];
};

export type SummaryInput = {
  code: GameCode;
  rows: readonly SummaryRow[];
  custom: readonly SummaryCustom[];
};

/** The rows a stage reads: the first half, or everything. Rows with no half count as first half at half time. */
export function inStage<T extends { half?: number | null }>(rows: readonly T[], stage: SummaryStage): T[] {
  return stage === "half_time" ? rows.filter((r) => r.half !== 2) : [...rows];
}

function inHalf<T extends { half?: number | null }>(rows: readonly T[], half: Half): T[] {
  return rows.filter((r) => r.half === half);
}

/** Every tile on the menu, judged for the stage. */
export function buildTiles(
  input: SummaryInput,
  menu: readonly TileDef[],
  targets: ReadonlyMap<TileKey, Target>,
  stage: SummaryStage,
  waiting: ReadonlyMap<TileKey, readonly string[]> = new Map(),
): TileResult[] {
  const defs = input.custom.map((c) => c.def);
  return menu.map((tile) => {
    const target = targetFor(tile.key, targets, input.code, defs);
    const id = customIdOf(tile.key);
    const custom = id ? input.custom.find((c) => c.def.id === id) : undefined;

    const figure = (scope: "all" | SummaryStage | Half): Figure => {
      const pick = <T extends { half?: number | null }>(list: readonly T[]) =>
        scope === "all" ? list : typeof scope === "number" ? inHalf(list, scope) : inStage(list, scope);
      return custom
        ? customFigure(custom.def, target.measure, pick(custom.entries))
        : standardFigure(tile.key as StatType, target.measure, pick(input.rows));
    };

    // Logged at all in this match: a stat nobody logged is not a nought.
    const loggedCount = custom
      ? customMine(custom.def, custom.entries).length
      : tileRows(tile.key as StatType, input.rows).length;
    const logged = loggedCount > 0;
    const names = [...(waiting.get(tile.key) ?? [])];

    const scope = stage === "half_time" ? "half" : "match";
    let headline = judge(figure(stage), target, scope, logged);
    if (names.length > 0 && headline.verdict !== "no_data") headline = { ...headline, verdict: "waiting" };

    const halves =
      stage === "full_time"
        ? ([1, 2] as const).map((half) => ({ half, judged: judge(figure(half), target, "half", logged) }))
        : null;

    const stageRows = inStage(input.rows, stage);
    const supporting = custom
      ? customSupporting(custom.def, inStage(custom.entries, stage))
      : standardSupporting(tile.key as StatType, stageRows, input.code);
    const events = custom
      ? customMine(custom.def, inStage(custom.entries, stage)).length
      : tileRows(tile.key as StatType, stageRows).length;

    return {
      ...tile,
      target,
      caption: headlineCaption(tile.key, target.measure, input.code, tile.title),
      headline,
      halves,
      supporting,
      events,
      waitingOn: names,
    };
  });
}

/* -------------------------------------------------------- supporting lines */

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Where on the pitch, in thirds: our end, the middle, theirs. Unplaced entries are left out. */
export function byThird(rows: readonly { originX?: number | null }[]): { defence: number; middle: number; attack: number } {
  const out = { defence: 0, middle: 0, attack: 0 };
  for (const r of rows) {
    if (r.originX == null) continue;
    const zone = zoneForX(r.originX);
    if (zone === "own_scoring_zone" || zone === "own_20_to_45") out.defence += 1;
    else if (zone === "opp_scoring_zone" || zone === "opp_45_to_20") out.attack += 1;
    else out.middle += 1;
  }
  return out;
}

function thirdsLine(rows: readonly { originX?: number | null }[]): string | null {
  const t = byThird(rows);
  if (t.defence + t.middle + t.attack === 0) return null;
  return `${t.defence} in defence, ${t.middle} in the middle, ${t.attack} in attack`;
}

function standardSupporting(type: StatType, rows: readonly SummaryRow[], code: GameCode): string[] {
  const mine = tileRows(type, rows);
  const lines: (string | null)[] = [];
  switch (type) {
    case "shot": {
      const ours = summariseShooting(rows, "us", code).overall;
      lines.push(ours.total > 0 ? ours.notation : null);
      const theirShots = rows.filter((r) => r.statType === "shot" && r.shotResult && shotSide(r) === "opposition");
      if (theirShots.length > 0) {
        const theirs = summariseShooting(rows, "opposition", code).overall;
        lines.push(`Theirs ${theirs.label}`);
      }
      const wides = mine.filter((r) => r.shotResult === "wide").length;
      if (wides > 0) lines.push(plural(wides, "wide"));
      break;
    }
    case "tackle": {
      const front = mine.filter((r) => r.frontEight).length;
      if (front > 0) lines.push(`${front} by the front eight`);
      lines.push(thirdsLine(mine));
      break;
    }
    case "delivery": {
      const won = mine.filter((r) => r.outcome === "positive").length;
      const lost = mine.filter((r) => r.outcome === "negative").length;
      lines.push(`${won} won, ${lost} lost, of ${mine.length}`);
      break;
    }
    case "turnover": {
      const won = mine.filter((r) => r.outcome === "positive");
      const lost = mine.filter((r) => r.outcome === "negative").length;
      lines.push(`${won.length} won, ${lost} lost`);
      const scored = won.filter((r) => r.ledToScore).length;
      if (scored > 0) lines.push(`${scored} of those won led to a score`);
      break;
    }
    case "free_conceded": {
      const scorable = mine.filter((r) => r.scorable).length;
      if (scorable > 0) lines.push(`${scorable} in scoring range`);
      lines.push(thirdsLine(mine));
      break;
    }
    case "puckout": {
      const ours = puckoutBreakdown(rows, "us");
      const theirs = puckoutBreakdown(rows, "opposition");
      if (ours.taken > 0) lines.push(`Ours: ${ours.retained} of ${ours.taken} kept`);
      if (theirs.taken > 0) {
        const broke = theirs.byLength.short.lost + theirs.byLength.medium.lost + theirs.byLength.long.lost + theirs.byLength.unrecorded.lost;
        lines.push(`Theirs: we won ${broke} of ${theirs.taken}`);
      }
      break;
    }
    case "free_won":
      lines.push(thirdsLine(mine));
      break;
    case "mark": {
      const advanced = mine.filter((r) => r.markKind === "advanced").length;
      if (advanced > 0) lines.push(plural(advanced, "advanced mark"));
      const theirs = rows.filter((r) => r.statType === "mark" && shotSide(r) === "opposition").length;
      if (theirs > 0) lines.push(`Theirs ${theirs}`);
      break;
    }
  }
  return lines.filter((l): l is string => l != null).slice(0, 3);
}

function customSupporting(def: CustomStatDef, entries: readonly CustomValues[]): string[] {
  const mine = customMine(def, entries);
  const lines: string[] = [];
  if (def.askOutcome) {
    const good = mine.filter((e) => e.outcome === "positive").length;
    const bad = mine.filter((e) => e.outcome === "negative").length;
    lines.push(`${good} good for us, ${bad} against`);
  }
  const scored = mine.filter((e) => e.ledToScore || e.score).length;
  if (def.scoreMode !== "none" && scored > 0) lines.push(`${scored} led to a score`);
  if (def.sideMode === "ask") {
    const theirs = entries.filter((e) => e.side === "opposition").length;
    if (theirs > 0) lines.push(`Theirs ${theirs}`);
  }
  return lines;
}

/* ------------------------------------------------------- the player view */

/**
 * The two tiles always on the player view: the squad's choice, or tackles
 * and shooting. A pinned stat the squad no longer logs drops out and the
 * next tile on the menu takes its place, so there are always two while the
 * menu has two.
 */
export function resolvePins(saved: readonly TileKey[] | null, menu: readonly TileDef[]): TileKey[] {
  const keys = menu.map((t) => t.key);
  const pins = (saved ?? DEFAULT_PINS).filter((k, i, all) => keys.includes(k) && all.indexOf(k) === i).slice(0, 2);
  for (const k of keys) {
    if (pins.length >= 2) break;
    if (!pins.includes(k)) pins.push(k);
  }
  return pins;
}

/** Whether a tile has enough behind it, and a target, to be put in front of the room. */
export function suggestible(tile: TileResult): boolean {
  const { headline } = tile;
  if (headline.gap == null) return false;
  if (headline.verdict !== "met" && headline.verdict !== "close" && headline.verdict !== "missed") return false;
  if (tile.target.measure === "rate" && (headline.figure.whole ?? 0) < MIN_RATE_EVENTS) return false;
  return true;
}

/**
 * The tiles the app puts forward beside the fixed two, ranked by how far
 * each is from its target. At half time only what is short of it: there is
 * a half left to fix it, and the fixed tiles already give the bearings. At
 * full time the worst miss and the best success, so the review of a win is
 * not all red; when only one kind exists, the rest come from it.
 */
export function suggestTiles(
  tiles: readonly TileResult[],
  pinned: readonly TileKey[],
  stage: SummaryStage,
  limit = MAX_PICKS,
): TileKey[] {
  const pool = tiles.filter((t) => !pinned.includes(t.key) && suggestible(t));
  const misses = pool.filter((t) => t.headline.gap! < 0).sort((a, b) => a.headline.gap! - b.headline.gap!);
  if (stage === "half_time") return misses.slice(0, limit).map((t) => t.key);

  const wins = pool.filter((t) => t.headline.gap! > 0).sort((a, b) => b.headline.gap! - a.headline.gap!);
  const picked: TileResult[] = [];
  if (misses[0]) picked.push(misses[0]);
  if (wins[0] && picked.length < limit) picked.push(wins[0]);
  for (const t of [...misses.slice(1), ...wins.slice(1)]) {
    if (picked.length >= limit) break;
    picked.push(t);
  }
  return picked.map((t) => t.key);
}

/** A saved pick, kept to tiles still on the menu, not pinned, and no more than the limit. */
export function cleanPicks(picks: readonly unknown[], menu: readonly TileDef[], pinned: readonly TileKey[]): TileKey[] {
  const keys = menu.map((t) => t.key);
  const out: TileKey[] = [];
  for (const p of picks) {
    if (typeof p !== "string" || !keys.includes(p) || pinned.includes(p) || out.includes(p)) continue;
    out.push(p);
    if (out.length >= MAX_PICKS) break;
  }
  return out;
}

/** "7, target at most 4 by half time" — why a tile was put forward, for the analyst. */
export function describeJudgement(tile: TileResult, stage: SummaryStage): string {
  const { headline, target } = tile;
  const shown = formatFigure(headline.figure, target.measure);
  if (headline.goal == null) return `${shown}, no target set`;
  const by = stage === "half_time" && target.measure === "count" ? " by half time" : "";
  const goal = formatGoal(headline.goal, target);
  return `${shown}, target ${TARGET_DIRECTION_LABELS[target.direction].toLowerCase()} ${goal}${by}`;
}

export function formatFigure(figure: Figure, measure: TargetMeasure): string {
  if (figure.value == null) return "None yet";
  return measure === "rate" ? `${figure.value}%` : String(figure.value);
}

export function formatGoal(goal: number, target: Pick<Target, "measure">): string {
  return target.measure === "rate" ? `${goal}%` : String(goal);
}

/* -------------------------------------------------------- score timeline */

/** One score on the timeline: where it sits, what it was worth, and the running total after it. */
export type ScoreStep = {
  side: Side;
  /** Position along the chart, with first-half stoppage time making room before the second half. */
  atMs: number;
  /** The game clock a coach would read. */
  clockMs: number;
  worth: number;
  goal: boolean;
  total: number;
};

/** Three or more scores in a row with no reply. */
export type ScoreRun = { side: Side; fromMs: number; toMs: number; scores: number; points: number };

export type ScoreTimeline = {
  ours: ScoreStep[];
  /** Null when nobody logged their shots: a flat line at nought would be a lie. */
  theirs: ScoreStep[] | null;
  runs: ScoreRun[];
  /** Scores with no time on them, still in the totals but not on the line. */
  untimed: number;
  /** Where half time sits on the chart. */
  halfTimeAt: number;
  /** The chart's right edge. */
  endAt: number;
};

/** A run is this many unanswered scores. Three is a spell a dressing room remembers. */
export const RUN_MIN = 3;

/**
 * The scores in the order they went over, as two running totals. A goal is
 * worth three on the line and a two-pointer two, as on the scoreboard. A
 * first half that ran into stoppage time pushes the second half along, so
 * a point at 32:00 in the first half never lands after one at 31:00 in the
 * second.
 */
export function scoreTimeline(rows: readonly SummaryRow[], halfLengthMin: number, stage: SummaryStage): ScoreTimeline {
  const halfMs = halfLengthMin * 60_000;
  const shots = inStage(rows, stage).filter((r) => r.statType === "shot" && r.shotResult);
  const theirsLogged = shots.some((r) => shotSide(r) === "opposition");
  const scoring = shots.filter((r) => isScore(r.shotResult));
  const timed = scoring.filter((r) => r.gameMs != null && (r.half === 1 || r.half === 2));

  const firstHalfEnd = Math.max(halfMs, ...timed.filter((r) => r.half === 1).map((r) => r.gameMs!));
  const overrun = firstHalfEnd - halfMs;
  const at = (r: SummaryRow) => (r.half === 2 ? r.gameMs! + overrun : r.gameMs!);

  const ordered = chronological(timed);
  const totals: Record<Side, number> = { us: 0, opposition: 0 };
  const steps: ScoreStep[] = ordered.map((r) => {
    const side = shotSide(r);
    const worth = resultValue(r.shotResult);
    totals[side] += worth;
    return { side, atMs: at(r), clockMs: r.gameMs!, worth, goal: r.shotResult === "goal", total: totals[side] };
  });

  const runs: ScoreRun[] = [];
  let current: ScoreStep[] = [];
  const close = () => {
    if (current.length >= RUN_MIN) {
      runs.push({
        side: current[0].side,
        fromMs: current[0].atMs,
        toMs: current[current.length - 1].atMs,
        scores: current.length,
        points: current.reduce((n, s) => n + s.worth, 0),
      });
    }
    current = [];
  };
  for (const s of steps) {
    if (current.length > 0 && current[0].side !== s.side) close();
    current.push(s);
  }
  close();

  const last = steps.length ? steps[steps.length - 1].atMs : 0;
  const halfTimeAt = firstHalfEnd;
  const endAt = Math.max(stage === "half_time" ? halfTimeAt : halfTimeAt + halfMs, last);
  return {
    ours: steps.filter((s) => s.side === "us"),
    theirs: theirsLogged ? steps.filter((s) => s.side === "opposition") : null,
    // "Unanswered" only means something when their scores were logged too.
    runs: theirsLogged ? runs : [],
    untimed: scoring.length - timed.length,
    halfTimeAt,
    endAt,
  };
}

/** The score at the end of the stage, ours and theirs, in GAA notation. */
export function stageScore(rows: readonly SummaryRow[], stage: SummaryStage, code: GameCode): { us: string; them: string | null } {
  const shown = inStage(rows, stage);
  const theirsLogged = shown.some((r) => r.statType === "shot" && shotSide(r) === "opposition");
  return {
    us: formatScore(summariseShooting(shown, "us", code).overall.score),
    them: theirsLogged ? formatScore(summariseShooting(shown, "opposition", code).overall.score) : null,
  };
}

/**
 * Which stage to open on: full time once the second half has started on any
 * clock or anything is logged in it, half time before that.
 */
export function defaultStage(rows: readonly { half?: number | null }[], secondHalfStarted: boolean): SummaryStage {
  return secondHalfStarted || rows.some((r) => r.half === 2) ? "full_time" : "half_time";
}
