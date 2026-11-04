/**
 * The ready-made drills every club can copy.
 *
 * These are code, not rows. A new club has them the moment it exists, an
 * improvement ships with a deploy rather than a data fix, and nothing a coach
 * does can edit or delete them. Copying one inserts an ordinary drill into the
 * club's own book (see `copyReadyDrill` in src/lib/actions/drills.ts), after
 * which it is theirs to change.
 *
 * Kept deliberately light: a set-up, two or three steps, a line on what each
 * step is for, and the coaching points. They are a starting point to open and
 * adapt, not a coaching manual. Each is built with the same helpers the editor
 * uses, so every one is a drill `parseDrill` accepts, and the ball is the
 * copying team's own (a sliotar for hurling and camogie, a football for the
 * footballers).
 *
 * Attacking drills run towards the right-hand goal, as the presets do.
 */
import {
  addBall,
  addCone,
  addStep,
  applyPreset,
  emptyDrill,
  markOutSmallPitch,
  DRILL_LIMITS,
  moveKit,
  movePiece,
  setSideCount,
  setSideName,
  setStepNote,
  type BallKind,
  type DrillData,
} from "./drill";

export const READY_CATEGORIES = ["Attacking", "Defending", "Skills", "Games", "Warm up"] as const;
export type ReadyCategory = (typeof READY_CATEGORIES)[number];

export type ReadyDrill = {
  id: string;
  category: ReadyCategory;
  title: string;
  /** The coaching points, copied into the drill's notes. */
  notes: string;
  build: (ball: BallKind) => DrillData;
};

/** `[x, y]` per piece id, in the same 0 to 1 pitch coordinates as everywhere. */
type Spots = Record<string, readonly [number, number]>;

function place(d: DrillData, step: number, spots: Spots): DrillData {
  let next = d;
  for (const [id, [x, y]] of Object.entries(spots)) {
    // movePiece ignores an id it does not know, which would leave a typo here
    // as a piece quietly standing still. These are fixed data, so fail loudly.
    if (!d.pieces.some((p) => p.id === id)) throw new Error(`Ready-made drill: no piece "${id}".`);
    next = movePiece(next, step, id, { x, y });
  }
  return next;
}

/** setStepNote cuts a long note without a word; here that is a mistake to fix. */
function note(d: DrillData, step: number, text: string): DrillData {
  if (text.length > DRILL_LIMITS.note) throw new Error(`Ready-made drill: step note too long: "${text}"`);
  return setStepNote(d, step, text);
}

/** A line-up from a preset with one ball, then the first step's note and spots. */
function opening(presetId: string, ball: BallKind, text: string, spots: Spots): DrillData {
  let d = applyPreset(emptyDrill(), presetId);
  d = addBall(d, ball);
  return note(place(d, 0, spots), 0, text);
}

/** The next step: copy the last, move what moves, say what is happening. */
function then(d: DrillData, text: string, spots: Spots): DrillData {
  const next = addStep(d, d.steps.length - 1);
  const i = next.steps.length - 1;
  return note(place(next, i, spots), i, text);
}

export const READY_DRILLS: readonly ReadyDrill[] = [
  /* ------------------------------------------------------------ attacking */
  {
    id: "attack-2v1",
    category: "Attacking",
    title: "Two on one: draw the defender and release",
    notes:
      "Carry the ball at the defender until they have to commit, then pass early to the runner outside. The runner calls for it and takes it on the move.",
    build: (ball) => {
      let d = opening("2v1", ball, "Attacker one has the ball. Attacker two supports wide and a step behind.", {
        ball1: [0.675, 0.43],
      });
      d = then(d, "Attacker one runs straight at the defender, who has to pick one of them.", {
        a1: [0.76, 0.45],
        a2: [0.74, 0.64],
        b1: [0.82, 0.5],
        ball1: [0.775, 0.45],
      });
      d = then(d, "Release the pass to the free player, who finishes.", {
        a1: [0.84, 0.43],
        a2: [0.86, 0.6],
        b1: [0.85, 0.46],
        ball1: [0.875, 0.6],
      });
      return d;
    },
  },
  {
    id: "attack-3v2",
    category: "Attacking",
    title: "Three on two: use the width",
    notes:
      "The middle attacker carries, the other two hold their width so the two defenders cannot cover everyone. Move the ball the moment a defender commits.",
    build: (ball) => {
      let d = opening("3v2", ball, "The middle attacker has the ball, the other two spread wide.", {
        ball1: [0.675, 0.51],
        a1: [0.66, 0.3],
        a3: [0.66, 0.7],
      });
      d = then(d, "Carry forward. The wide players run on, they do not wait.", {
        a1: [0.76, 0.26],
        a2: [0.76, 0.5],
        a3: [0.76, 0.74],
        b1: [0.82, 0.44],
        b2: [0.82, 0.58],
        ball1: [0.775, 0.51],
      });
      d = then(d, "The defenders have committed to the middle. Pass out to the free winger.", {
        a1: [0.86, 0.3],
        a2: [0.85, 0.5],
        a3: [0.86, 0.72],
        b1: [0.85, 0.42],
        b2: [0.85, 0.56],
        ball1: [0.87, 0.3],
      });
      return d;
    },
  },
  {
    id: "attack-4v3",
    category: "Attacking",
    title: "Four on three: move the ball across the line",
    notes:
      "With an extra attacker there is always a free player. Pass quickly across the line and the defence is always a step late. Finish with the player who has most room.",
    build: (ball) => {
      let d = opening("4v3", ball, "Four attackers against three defenders, ball with an inside player.", {
        ball1: [0.675, 0.44],
      });
      d = then(d, "First pass goes across to the far side, and the attackers drive forward.", {
        a1: [0.74, 0.27],
        a2: [0.74, 0.42],
        a3: [0.74, 0.58],
        a4: [0.74, 0.73],
        b1: [0.82, 0.4],
        b2: [0.82, 0.5],
        b3: [0.82, 0.6],
        ball1: [0.755, 0.73],
      });
      d = then(d, "The defence has slid across. The free player on the other side finishes.", {
        a1: [0.85, 0.3],
        a2: [0.85, 0.44],
        a3: [0.86, 0.58],
        a4: [0.82, 0.74],
        b1: [0.84, 0.46],
        b2: [0.85, 0.56],
        b3: [0.85, 0.66],
        ball1: [0.865, 0.3],
      });
      return d;
    },
  },
  {
    id: "attack-1v1",
    category: "Attacking",
    title: "One on one: win the duel and score",
    notes:
      "Run at the defender at pace, show the ball one way, go the other. Decide early whether to take the shot or carry in, and commit to it.",
    build: (ball) => {
      let d = opening("1v1", ball, "The attacker has the ball at the 45. The defender stands goal side.", {
        ball1: [0.675, 0.51],
      });
      d = then(d, "Drive at the defender and show the ball one way.", {
        a1: [0.76, 0.5],
        b1: [0.82, 0.5],
        ball1: [0.775, 0.51],
      });
      d = then(d, "Go the other way, past the defender, and finish.", {
        a1: [0.86, 0.4],
        b1: [0.86, 0.5],
        ball1: [0.875, 0.41],
      });
      return d;
    },
  },

  /* ------------------------------------------------------------ defending */
  {
    id: "defend-1v1",
    category: "Defending",
    title: "One on one: stay goal side and delay",
    notes:
      "Do not dive in. Stay side on, between the ball and the goal, and back off at the speed of the attacker. Wait for the heavy touch, then go for the ball.",
    build: (ball) => {
      let d = opening("1v1", ball, "The defender stands goal side, a couple of strides from the attacker.", {
        ball1: [0.675, 0.51],
      });
      d = then(d, "As the attacker comes on, the defender backs off and stays square.", {
        a1: [0.74, 0.5],
        b1: [0.84, 0.5],
        ball1: [0.755, 0.51],
      });
      d = then(d, "Attacker takes a heavy touch. Now the defender steps in and wins it.", {
        a1: [0.8, 0.46],
        b1: [0.84, 0.5],
        ball1: [0.835, 0.5],
      });
      return d;
    },
  },
  {
    id: "defend-delay",
    category: "Defending",
    title: "Two defenders against three: delay and cover",
    notes:
      "The first defender slows the ball without committing, the second covers behind. Talk all the time: who has the ball, who has the runner. Buy time for the others to get back.",
    build: (ball) => {
      let d = opening("3v2", ball, "Two defenders against three attackers, ball with the middle attacker.", {
        ball1: [0.675, 0.51],
      });
      d = then(d, "The first defender closes down, the second drops off and covers the space behind.", {
        a1: [0.74, 0.3],
        a2: [0.74, 0.5],
        a3: [0.74, 0.7],
        b1: [0.79, 0.5],
        b2: [0.86, 0.58],
        ball1: [0.755, 0.51],
      });
      d = then(d, "Attackers go wide. The defenders slide across and stay compact.", {
        a1: [0.8, 0.28],
        a2: [0.8, 0.5],
        a3: [0.8, 0.72],
        b1: [0.83, 0.42],
        b2: [0.86, 0.6],
        ball1: [0.815, 0.72],
      });
      return d;
    },
  },
  {
    id: "defend-close-down",
    category: "Defending",
    title: "Closing down the ball carrier",
    notes:
      "Everyone moves when the ball moves. Close the carrier quickly and get a hand or stick on it, and the nearest teammates tighten up on their men so there is no easy pass.",
    build: (ball) => {
      let d = opening("4v3", ball, "Four attackers have the ball. Three defenders hold a line.", {
        ball1: [0.675, 0.44],
      });
      d = then(d, "The defenders step up together as the ball is played in.", {
        a1: [0.72, 0.29],
        a2: [0.72, 0.43],
        a3: [0.72, 0.57],
        a4: [0.72, 0.71],
        b1: [0.78, 0.38],
        b2: [0.78, 0.5],
        b3: [0.78, 0.62],
        ball1: [0.735, 0.43],
      });
      d = then(d, "The nearest defender closes the carrier. The others mark tight and cut off the pass.", {
        b1: [0.76, 0.36],
        b2: [0.76, 0.46],
        b3: [0.76, 0.6],
        a2: [0.73, 0.43],
        ball1: [0.74, 0.43],
      });
      return d;
    },
  },

  /* --------------------------------------------------------------- skills */
  {
    id: "skills-triangle",
    category: "Skills",
    title: "Pass and move in threes",
    notes:
      "Pass, then move into space. Never stand and admire the pass. Use both hands or both sides, and call the name of the person you are passing to.",
    build: (ball) => {
      let d = setSideCount(setSideCount(emptyDrill(), "a", 3), "b", 0);
      d = setSideName(d, "a", "Players");
      d = addBall(d, ball);
      d = place(d, 0, { a1: [0.4, 0.5], a2: [0.55, 0.38], a3: [0.55, 0.62], ball1: [0.415, 0.51] });
      d = note(d, 0,"Three players in a triangle, about 15 metres apart. One has the ball.");
      d = then(d, "Pass to the next player, then run to take their spot.", {
        a1: [0.55, 0.38],
        a2: [0.55, 0.62],
        a3: [0.4, 0.5],
        ball1: [0.565, 0.4],
      });
      d = then(d, "Keep going round. Change the direction on the coach's call.", {
        a1: [0.55, 0.62],
        a2: [0.4, 0.5],
        a3: [0.55, 0.38],
        ball1: [0.565, 0.64],
      });
      return d;
    },
  },
  {
    id: "skills-weave",
    category: "Skills",
    title: "Weave the cones and finish",
    notes:
      "Ball close on the way through, head up on the way out. Speed up after the last cone and shoot without breaking stride.",
    build: (ball) => {
      let d = setSideCount(setSideCount(emptyDrill(), "a", 1), "b", 0);
      d = setSideName(d, "a", "Player");
      d = addBall(d, ball);
      for (let i = 0; i < 4; i++) d = addCone(d);
      const row = [0.5, 0.6, 0.7, 0.8];
      row.forEach((x, i) => {
        d = moveKit(d, `cone${i + 1}`, { x, y: 0.5 });
      });
      d = place(d, 0, { a1: [0.4, 0.5], ball1: [0.415, 0.51] });
      d = note(d, 0,"A row of four cones, a stride and a half apart in real life, and a shot at the end.");
      d = then(d, "Weave in and out of the cones with the ball close.", {
        a1: [0.74, 0.46],
        ball1: [0.755, 0.47],
      });
      d = then(d, "Out of the last cone, speed up and shoot.", {
        a1: [0.87, 0.5],
        ball1: [0.95, 0.5],
      });
      return d;
    },
  },

  /* ---------------------------------------------------------------- games */
  {
    id: "game-5v5",
    category: "Games",
    title: "Five a side small game",
    notes:
      "Two small goals, no goalkeepers. Everyone attacks and everyone defends, which is the point. Change the rules to fit the session: a limit on touches, or a score only counts after every player has touched the ball.",
    build: (ball) => {
      let d = markOutSmallPitch(applyPreset(emptyDrill(), "5v5"));
      d = addBall(d, ball);
      d = note(d, 0,"Five against five on a pitch about 60 by 40 metres. Ball in from the middle.");
      d = then(d, "Play flows both ways. Whoever wins the ball attacks the opposite goal.", {
        a2: [0.52, 0.4],
        a3: [0.55, 0.5],
        b2: [0.48, 0.55],
        ball1: [0.54, 0.5],
      });
      return d;
    },
  },
  {
    id: "game-7v7",
    category: "Games",
    title: "Seven a side possession game",
    notes:
      "Keep the ball and look for the open man. Score by getting the ball over the opposition's end line under control. Praise the pass that breaks a line.",
    build: (ball) => {
      let d = markOutSmallPitch(applyPreset(emptyDrill(), "7v7"));
      d = addBall(d, ball);
      d = note(d, 0,"Seven against seven in a big grid. Ball in from the middle.");
      d = then(d, "Win it, keep it and move it quickly through the lines.", {
        a3: [0.52, 0.4],
        a4: [0.54, 0.55],
        b4: [0.47, 0.5],
        ball1: [0.53, 0.55],
      });
      return d;
    },
  },

  /* ------------------------------------------------------------- warm up */
  {
    id: "warm-pairs",
    category: "Warm up",
    title: "Pairs passing on the move",
    notes:
      "Start easy and build the pace. Short passes first, then longer. Switch hands or sides every few passes so both are used.",
    build: (ball) => {
      let d = setSideCount(setSideCount(emptyDrill(), "a", 2), "b", 0);
      d = setSideName(d, "a", "Pair");
      d = addBall(d, ball);
      d = place(d, 0, { a1: [0.35, 0.45], a2: [0.35, 0.58], ball1: [0.365, 0.46] });
      d = note(d, 0,"Two players side by side with a ball. They jog up the pitch together.");
      d = then(d, "Pass back and forth as they move forward.", {
        a1: [0.5, 0.45],
        a2: [0.5, 0.58],
        ball1: [0.5, 0.56],
      });
      d = then(d, "Keep passing to the far end, then turn and come back.", {
        a1: [0.65, 0.45],
        a2: [0.65, 0.58],
        ball1: [0.65, 0.47],
      });
      return d;
    },
  },
];

export function readyDrill(id: string): ReadyDrill | null {
  return READY_DRILLS.find((d) => d.id === id) ?? null;
}

export function isReadyCategory(v: unknown): v is ReadyCategory {
  return READY_CATEGORIES.includes(v as ReadyCategory);
}
