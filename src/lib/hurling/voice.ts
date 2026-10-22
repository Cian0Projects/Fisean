/**
 * Reading a spoken stat: "shot seven point from a free" into the fields a
 * coach would otherwise click.
 *
 * The speech engine (the browser's own, for now) only turns sound into text.
 * Everything that makes the text mean something lives here, so the engine
 * can be swapped for a paid one without touching a word of this, and so the
 * words people actually say can be tested.
 *
 * Three rules shape it:
 *
 * - **Many words, one meaning.** One coach says "delivery", another "pass",
 *   another "ball in". The phrase table below is the whole vocabulary; adding
 *   a word is adding a line. Longer phrases are matched first, so "free won"
 *   is a stat type before "won" is an outcome, and "from a puckout" is where a
 *   shot came from rather than a poc amach.
 * - **Never guess.** A word that is not in the table is ignored, and a field
 *   nobody mentioned is left alone. A half-heard stat leaves gaps for a tap,
 *   it does not fill them with something plausible.
 * - **The whole phrase, every time.** The engine revises its guesses while
 *   someone is still talking ("shop" becomes "shot seven"), so the caller
 *   re-reads everything heard since the mic opened on every change, rather
 *   than locking each word in as it arrives. A correction mid-sentence ("seven,
 *   eight") lands the same way: the later word wins.
 *
 * "Scrap that" and its cousins wipe whatever came before them, so only the
 * words after the last one count. That is how a stat is retaken without
 * touching the screen.
 */
import type {
  AttemptSource,
  Half,
  PossessionKind,
  PuckoutLength,
  PuckoutSide,
  ShotKind,
  ShotResult,
  Side,
  StatOutcome,
  StatType,
} from "./stats";
import { MAX_JERSEY } from "./stats";

/**
 * What was heard, in the shape of the logging form's own fields, numbers kept
 * as text the way the form types them. Only what was said is set.
 */
export type VoiceFields = Partial<{
  half: Half;
  outcome: StatOutcome;
  playerNumber: string;
  targetNumber: string;
  side: Side;
  shotResult: ShotResult;
  shotKind: ShotKind;
  attemptSource: AttemptSource;
  ledToScore: boolean;
  possession: PossessionKind;
  frontEight: boolean;
  scorable: boolean;
  puckoutTakenBy: PuckoutSide;
  puckoutLength: PuckoutLength;
  pastSixtyFive: boolean;
}>;

export type VoiceStat = {
  /** What was said, or the form's current type when nobody said one. */
  statType: StatType;
  /** Whether the type came from the words rather than the form. */
  typeSaid: boolean;
  fields: VoiceFields;
  /** How many times "scrap that" was said, so the caller can clear the map once per retake. */
  resets: number;
  /** Words understood after the last reset. Zero means nothing was caught. */
  hits: number;
};

type Meaning =
  | { t: "type"; v: StatType }
  | { t: "result"; v: ShotResult }
  | { t: "side"; v: Side }
  | { t: "won" }
  | { t: "lost" }
  | { t: "unclear" }
  | { t: "length"; v: PuckoutLength }
  | { t: "kind"; v: ShotKind }
  | { t: "source"; v: AttemptSource }
  | { t: "possession"; v: PossessionKind }
  | { t: "scored" }
  | { t: "front" }
  | { t: "scorable" }
  | { t: "past65" }
  | { t: "half"; v: Half }
  | { t: "cancel" }
  | { t: "number"; v: number };

/** "from a puckout", "off the kickout", "from puck out", and so on. */
function fromA(nouns: string[]): string[] {
  const out: string[] = [];
  for (const prep of ["from", "off"]) {
    for (const article of ["", "a ", "the ", "an "]) {
      for (const noun of nouns) out.push(`${prep} ${article}${noun}`);
    }
  }
  return out;
}

// The restart is a puck-out in hurling and camogie, a kick-out in football;
// people say either, and the engine hears "poc amach" a few different ways.
const RESTART = [
  "puckout", "puckouts", "puck out", "puck outs", "puck", "poc amach", "puc amach", "pock amach", "poc",
  "kickout", "kickouts", "kick out", "kick outs", "restart",
];

/**
 * The vocabulary. Matched against the normalised text (lower case, accents
 * off, number words as digits), longest phrase first.
 */
const PHRASES: [string[], Meaning][] = [
  /* -------------------------------------------------------------- types */
  [["tackle", "tackles", "tackled", "tackling"], { t: "type", v: "tackle" }],
  [["delivery", "deliveries", "deliver", "delivered", "pass", "passes", "passed", "passing", "delivering", "ball in", "long ball", "kick pass"], { t: "type", v: "delivery" }],
  [["turnover", "turnovers", "turn over", "turned over"], { t: "type", v: "turnover" }],
  [["shot", "shots", "shoot", "shooting", "attempt", "effort"], { t: "type", v: "shot" }],
  [RESTART, { t: "type", v: "puckout" }],
  [
    ["free won", "won a free", "free for us", "free to us", "free in", "got a free", "we got a free", "fouled", "we were fouled"],
    { t: "type", v: "free_won" },
  ],
  [
    ["free conceded", "free conceding", "free concede", "conceded a free", "conceded free", "free against", "free against us", "free to them", "free for them", "gave away a free", "gave a free"],
    { t: "type", v: "free_conceded" },
  ],

  /* ------------------------------------------------------- shot results */
  // "cool" is how the engine most often writes cúl.
  [["goal", "cul", "cool", "green flag", "net", "back of the net", "major"], { t: "result", v: "goal" }],
  [["point", "points", "over", "over the bar", "white flag", "cuilin"], { t: "result", v: "point" }],
  // Football's score from outside the arc. "Two" arrives as a digit.
  [["2 pointer", "2 pointers", "2 point", "2 points", "2 point score", "outside the arc", "from outside the arc"], { t: "result", v: "two_pointer" }],
  [["wide", "went wide", "missed", "miss"], { t: "result", v: "wide" }],
  [["saved", "save", "keeper saved"], { t: "result", v: "saved" }],
  [["65", "45", "won a 65", "won a 45", "out for a 65", "out for a 45"], { t: "result", v: "sixty_five" }],

  /* ---------------------------------------------------- how it was taken */
  [["free", "from a free", "off a free", "placed", "placed ball", "penalty", "sideline", "sideline cut", "sideline kick", ...fromA(["65", "45"])], { t: "kind", v: "free" }],
  [["from play", "play", "open play"], { t: "kind", v: "play" }],
  [fromA(RESTART), { t: "source", v: "puckout" }],
  [fromA(["turnover", "turn over"]), { t: "source", v: "turnover" }],

  /* --------------------------------------------------------------- sides */
  [["ours", "our", "us", "we", "our own"], { t: "side", v: "us" }],
  [["theirs", "their", "them", "they", "opposition", "opponents", "the opposition"], { t: "side", v: "opposition" }],

  /* ------------------------------------------------------------ outcomes */
  [
    ["won", "win", "won it", "we won", "we won it", "kept", "kept it", "retained", "good", "caught", "found", "gained", "success", "successful", "complete", "completed"],
    { t: "won" },
  ],
  [["lost", "lose", "lost it", "they won", "they won it", "intercepted", "bad", "conceded"], { t: "lost" }],
  [["unclear", "broke", "break", "broken", "breaking", "breaking ball", "neither", "nobody", "50 50"], { t: "unclear" }],

  /* ------------------------------------------------------------- details */
  // "A short one" would otherwise credit it to number 1.
  [["short", "short 1", "dropped short", "drop short", "fell short", "came up short"], { t: "length", v: "short" }],
  [["medium", "mid", "middle", "mid 1"], { t: "length", v: "medium" }],
  [["long", "long 1"], { t: "length", v: "long" }],
  [["60 40"], { t: "possession", v: "sixty_forty" }],
  [["60 plus"], { t: "possession", v: "sixty_plus" }],
  [["unforced", "unforced error", "gave it away", "coughed it up"], { t: "possession", v: "unforced" }],
  [["scored", "we scored", "scored from it", "scored off it", "score from it", "led to a score", "led to a point", "led to a goal"], { t: "scored" }],
  [["front 8"], { t: "front" }],
  [["scorable", "scoreable", "in range", "within range", "kickable", "pointable"], { t: "scorable" }],
  // A football code measures the same thing by its own 45.
  [["past the 65", "past our 65", "past 65", "out past the 65", "past the 45", "past our 45", "past 45", "out past the 45", "worked out", "worked it out"], { t: "past65" }],
  [["first half", "1st half"], { t: "half", v: 1 }],
  [["second half", "2nd half"], { t: "half", v: 2 }],

  /* ------------------------------------------------------------- retakes */
  [
    ["scrap that", "scrap it", "scratch that", "cancel", "cancel that", "delete that", "start again", "start over", "forget it", "forget that", "dont want that", "no no", "wrong"],
    { t: "cancel" },
  ],
];

const TABLE = new Map<string, Meaning>();
for (const [phrases, meaning] of PHRASES) for (const p of phrases) TABLE.set(p, meaning);
const LONGEST = Math.max(...[...TABLE.keys()].map((k) => k.split(" ").length));

const ONES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
/**
 * Words the engine writes for a number it misheard. Only trusted straight
 * after "number", because "for", "to" and "won" mean something else anywhere
 * else in a sentence.
 */
const SOUNDS_LIKE: Record<string, number> = { for: 4, fore: 4, to: 2, too: 2, ate: 8, won: 1, tree: 3 };

/**
 * What the engine writes for a stat type it misheard. The type is the first
 * word out, and the first word is the one the engine hears worst: it has no
 * sentence yet to guess from, and the start of it is often clipped while the
 * mic opens. So these count only at the start of a stat (or straight after a
 * "scrap that"), before anything else has been understood. Anywhere later in a
 * sentence they are ordinary words and drop out.
 *
 * Only words the engine actually writes belong here (it spells real words,
 * never "tackel"), written as they arrive after normalising, so "free one" is
 * "free 1". A word the phrase table already knows keeps that meaning: "short"
 * stays a poc amach's length and "found" an outcome, never a shot or a foul.
 * Everyday openers ("so", "sure", "what") are left out on purpose; "sure he
 * lost it" must not become a shot.
 */
const LEADING_SOUNDS_LIKE: [string[], StatType][] = [
  [
    [
      "shop", "shops", "shut", "shout", "shouts", "shock", "shocks", "shocked", "chop", "chops",
      "shoe", "shoes", "shod", "shaw", "shaun", "scott", "scot", "shoots", "jot",
    ],
    "shot",
  ],
  [["tickle", "tickles", "taco", "tacos", "tack", "tacked", "cackle", "attack", "attacked", "tackler"], "tackle"],
  [
    [
      "livery", "the livery", "delhi", "deli", "liver", "the liver",
      // "Pass" alone is short, and comes back as anything ending in an s.
      "past", "pasta", "parse", "bass", "pause", "paws", "pasts", "kick past", "fall in", "bowl in", "bowling",
    ],
    "delivery",
  ],
  [["turn of", "turn off", "turnoff", "turner", "turners", "turnip", "term over"], "turnover"],
  [
    [
      "pocket", "pockets", "pack out", "back out", "pick out", "park out", "poke out", "pock out", "pucked out",
      "puck it", "pack it", "puck a mock", "pock a mock", "puck a mac", "puck amok", "poke a mock", "pucker mock",
      "kick it", "kicked out", "kit out", "kick it out",
    ],
    "puckout",
  ],
  // "Free won" comes back as "free one" more often than not. That costs a
  // keeper's free opening with "free, one": say "shot one" for those.
  [["free 1", "free win", "free run", "free wan", "fold", "folded", "foaled", "fowled", "foiled", "fool"], "free_won"],
  [["free conceited", "free concealed", "free considered", "free can seeded"], "free_conceded"],
];
const LEADING = new Map<string, Meaning>(
  LEADING_SOUNDS_LIKE.flatMap(([said, v]) => said.map((s): [string, Meaning] => [s, { t: "type", v }])),
);
const LEADING_LONGEST = Math.max(...[...LEADING.keys()].map((k) => k.split(" ").length));

/** Lower case, accents off, punctuation gone, number words as digits. */
export function normaliseSpeech(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/'/g, "")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = out[out.length - 1];
    if ((prev === "number" || prev === "no") && w in SOUNDS_LIKE) {
      out.push(String(SOUNDS_LIKE[w]));
    } else if (w in TENS) {
      const next = words[i + 1];
      const unit = next && next in ONES && ONES[next] < 10 ? ONES[next] : 0;
      if (unit) i++;
      out.push(String(TENS[w] + unit));
    } else if (w in ONES) {
      out.push(String(ONES[w]));
    } else {
      out.push(w);
    }
  }
  return out;
}

/**
 * Every phrase understood, in the order said. Unknown words drop out, but a
 * filler at the start ("um", "right") does not stop the next word counting as
 * the first.
 */
function meanings(words: string[]): Meaning[] {
  const out: Meaning[] = [];
  let leading = true;
  let i = 0;
  type Hit = { m: Meaning; len: number } | null;
  const longestAt = (table: ReadonlyMap<string, Meaning>, longest: number): Hit => {
    for (let len = Math.min(longest, words.length - i); len > 0; len--) {
      const m = table.get(words.slice(i, i + len).join(" "));
      if (m) return { m, len };
    }
    return null;
  };
  while (i < words.length) {
    // At the start, a sound-alike is tried beside the table and the longer
    // match wins, so "free one" is a free won rather than "free" then a 1.
    // On a tie the table wins.
    const known = longestAt(TABLE, LONGEST);
    const alike: Hit = leading ? longestAt(LEADING, LEADING_LONGEST) : null;
    const hit: Hit = alike && (!known || alike.len > known.len) ? alike : known;
    if (hit) {
      out.push(hit.m);
      i += hit.len;
      leading = hit.m.t === "cancel";
      continue;
    }
    if (/^\d+$/.test(words[i])) {
      out.push({ t: "number", v: Number(words[i]) });
      leading = false;
    }
    i++;
  }
  return out;
}

/**
 * Read one stat out of everything heard since the mic opened. `current` is
 * the type the form already shows, used when nobody names one.
 */
export function parseSpokenStat(text: string, current: StatType): VoiceStat {
  const all = meanings(normaliseSpeech(text));
  let lastCancel = -1;
  let resets = 0;
  all.forEach((m, i) => {
    if (m.t === "cancel") {
      lastCancel = i;
      resets++;
    }
  });
  const said = all.slice(lastCancel + 1);

  const typed = said.filter((m) => m.t === "type");
  const results = said.filter((m) => m.t === "result");
  // A result names the type by itself: "seven point" can only be a shot.
  const statType: StatType = typed.length ? typed[typed.length - 1].v : results.length ? "shot" : current;

  const f: VoiceFields = {};
  const numbers: number[] = [];
  let won: boolean | null = null;
  let unclear = false;
  let short = false;

  for (const m of said) {
    switch (m.t) {
      case "number":
        if (Number.isInteger(m.v) && m.v >= 1 && m.v <= MAX_JERSEY) numbers.push(m.v);
        break;
      case "half":
        f.half = m.v;
        break;
      case "won":
        won = true;
        unclear = false;
        break;
      case "lost":
        won = false;
        unclear = false;
        break;
      case "unclear":
        unclear = true;
        won = null;
        break;
      case "length":
        if (statType === "puckout") f.puckoutLength = m.v;
        if (m.v === "short") short = true;
        break;
      case "side":
        if (statType === "shot") f.side = m.v;
        // The first side named is whose poc amach it was; who won the break
        // is said with "won" or "lost", so a later "ours" does not move it.
        if (statType === "puckout" && f.puckoutTakenBy === undefined) f.puckoutTakenBy = m.v;
        break;
      case "result":
        if (statType === "shot") f.shotResult = m.v;
        break;
      case "kind":
        if (statType === "shot") f.shotKind = m.v;
        break;
      case "source":
        if (statType === "shot") f.attemptSource = m.v;
        break;
      case "possession":
        if (statType === "turnover") f.possession = m.v;
        if (statType === "turnover" && m.v === "unforced") won = false;
        break;
      case "scored":
        if (statType === "turnover") f.ledToScore = true;
        break;
      case "front":
        if (statType === "tackle") f.frontEight = true;
        break;
      case "scorable":
        if (statType === "free_conceded") f.scorable = true;
        break;
      case "past65":
        if (statType === "puckout") f.pastSixtyFive = true;
        break;
    }
  }

  // Who it was. A delivery names two, struck by and aimed at, in that order;
  // anything else names one, and a second number is a correction of the first.
  if (numbers.length) {
    if (statType === "delivery") {
      f.playerNumber = String(numbers[0]);
      if (numbers.length > 1) f.targetNumber = String(numbers[1]);
    } else {
      f.playerNumber = String(numbers[numbers.length - 1]);
    }
  }

  if (statType === "puckout") {
    if (unclear) f.outcome = "unclear";
    else if (won !== null) f.outcome = won ? "positive" : "negative";
  }
  if (statType === "delivery" || statType === "turnover") {
    if (won !== null) f.outcome = won ? "positive" : "negative";
    // Scoring from a turnover means we won it, whether or not that was said.
    if (statType === "turnover" && f.ledToScore && f.outcome === undefined) f.outcome = "positive";
  }
  // A shot dropped short is only a result once it is said who kept the ball.
  if (statType === "shot" && f.shotResult === undefined && short && won !== null) {
    f.shotResult = won ? "retained" : "lost";
  }

  return { statType, typeSaid: typed.length > 0, fields: f, resets, hits: said.length };
}

/** How much of a phrase made sense, to pick between the engine's alternative guesses. */
export function speechScore(text: string): number {
  return meanings(normaliseSpeech(text)).length;
}
