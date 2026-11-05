/**
 * The four public pages that each speak to one code: /hurling, /camogie,
 * /gaelic-football and /ladies-football.
 *
 * They exist for search. The home page talks about all four codes at once, so
 * a football coach searching for a stats app lands on a page that opens with
 * hurling; each of these answers one code's searches in that code's words.
 * They are doors into the same site, not separate sites: every one leads to
 * /start, the home page and the other three.
 *
 * Three rules hold the copy, the same as the home page's:
 *
 * - Every claim is something the app does today for that code. What differs
 *   is read from the rules the app itself runs on (`termsFor` in
 *   src/lib/hurling/codes.ts: the restart, the end-line free, the line
 *   deliveries are measured from, the arc, the mark), so a page cannot
 *   promise a football club something the stat sheet does not do.
 * - Each page carries its own section on what is particular to its code.
 *   Four pages with the same words and the sport's name swapped would be
 *   near duplicates, which search engines fold together and rank as one.
 * - A picture is only shown on the page for the code it shows, never borrowed
 *   from another code's game (the rule CodeHero.tsx keeps for its
 *   photographs). Each code has its own clipping screen, the real clip editor
 *   with that code's footage in it, taken from a throwaway copy of the app.
 *   The drill board with a sliotar serves hurling and camogie; the one with a
 *   football, its two-point arcs drawn, serves both football codes.
 *
 * Pure data, so tests/code-pages.test.mjs can hold the wording to the rules:
 * title and description lengths, no dashes, nothing invented.
 */
import type { Metadata } from "next";
import { termsFor, type GameCode } from "./hurling/codes";
import { SITE, socialFor } from "./seo";

export type CodeScreen = {
  name: string;
  title: string;
  text: string;
  /** Left out where the only screenshot there is shows another code. */
  image?: { src: string; alt: string; fit?: string };
};

export type CodePage = {
  code: GameCode;
  /** The address, with its leading slash. */
  path: string;
  /** How the code is named in a link or a heading. */
  label: string;
  /** How it is named mid-sentence: "built for hurling", "built for Gaelic football". */
  named: string;
  title: string;
  description: string;
  headline: string;
  intro: string;
  photo: { src: string; focus?: string };
  /** The four things Ardawn does, said for this code. */
  features: { watch: string; clip: string; stats: string; drills: string };
  /** What is particular to this code, each one something the app does. */
  rules: { name: string; text: string }[];
  screens: CodeScreen[];
  questions: { q: string; a: string }[];
};

/* Shared pictures. Only `stats` shows no particular code's game on it. */
const CLIPPING_HURLING = {
  src: "/home/clipping.jpg",
  alt: "The review screen during a hurling match: the footage playing, six tagged clips listed beside it, including a cúilín and a cúl, and a timeline of clips underneath.",
};
const STATS_SIDELINE = {
  src: "/home/stats-game.jpg",
  alt: "A coach in the stand at a floodlit match, holding a tablet that shows the stat sheet with a pitch map and stat buttons while the game goes on behind it.",
  fit: "object-bottom",
};
const DRILL_SLIOTAR = {
  src: "/home/drill-dark.jpg",
  alt: "The drill board: three attackers and two defenders and a sliotar on a pitch marked at the 13, 20, 45 and 65, with steps, playback speed and an export button below.",
};
const DRILL_FOOTBALL = {
  src: "/home/drill-football.jpg",
  alt: "The drill board: three attackers and two defenders and a football on a pitch with the two-point arc drawn at each end, arrows showing each run and the pass out to the free winger, with the steps and the export button below.",
};
/* The clip editor, each with that code's own footage paused in it. */
const CLIPPING_CAMOGIE = {
  src: "/home/clipping-camogie.jpg",
  alt: "The clip editor during a camogie match: a run through the middle at goal paused on screen, the clip titled and shared with all players, and the trim bar underneath.",
};
const CLIPPING_FOOTBALL = {
  src: "/home/clipping-football.jpg",
  alt: "The clip editor during a Gaelic football match: the ball worked in towards goal paused on screen, the clip titled and shared with all players, and the trim bar underneath.",
};
const CLIPPING_LADIES = {
  src: "/home/clipping-ladies-football.jpg",
  alt: "The clip editor during a ladies football match: an attack worked in on goal paused on screen, the clip titled and shared with all players, and the trim bar underneath.",
};

const hurling = termsFor("hurling");
const camogie = termsFor("camogie");
const football = termsFor("football");
const ladies = termsFor("ladies_football");

/* Answers every code's page gives, in the same words as the home page. */
const FOOTAGE_ANSWER =
  "Any match saved as an MP4. Upload it, or bring it in from Veo, Pixellot, Hudl, Spiideo, Google Drive or Dropbox.";
const INSTALL_ANSWER =
  "No. It works in the browser on any phone or laptop. Players and coaches join with your team's code at no charge.";

export const CODE_PAGES: readonly CodePage[] = [
  {
    code: "hurling",
    path: "/hurling",
    label: "Hurling",
    named: "hurling",
    title: "Hurling video analysis and stats for clubs: Ardawn",
    description:
      "Analysis platform for hurling clubs and counties. Clip the match for the panel, log every poc amach, shot and turnover on a pitch map, and draw your drills.",
    headline: "The hurling analysis platform for your club.",
    intro:
      "Upload the match and the whole panel can watch it back on their phones. Clip the scores and the turnovers, keep the stat sheet live from the line or afterwards from the footage, and draw the drills for training. All of it in hurling's own terms: the poc amach, the 65, the cúl and the cúilín.",
    photo: { src: "/home/codes/hurling-2026.webp" },
    features: {
      watch: "Full matches in game time, on any phone or laptop.",
      clip: "Cut out the scores, the wides and the turnovers and send them to the players involved.",
      stats: "Log every poc amach, shot and turnover and see them on a pitch map.",
      drills: "Draw a drill with a sliotar, play it back and share it as a video.",
    },
    rules: [
      {
        name: `The ${hurling.restart.toLowerCase()}`,
        text: "Log whose puck-out it was, how far it went, short, medium or long, and whether the break was won, lost or unclear. Yours and theirs both land on the pitch map.",
      },
      {
        name: "Every shot, from where it was struck",
        text: `From play or a placed ball, yours and theirs: a cúl, a cúilín, a wide, saved, dropped short, or put out for a ${hurling.endLineFree}. The shooting reads back as scored from attempted.`,
      },
      {
        name: `Deliveries from inside your ${hurling.line}`,
        text: `Ball struck from inside your own ${hurling.line} to beyond theirs, drawn as an arrow from where it was struck to where it landed, and marked won or lost.`,
      },
      {
        name: "Tackles, turnovers and frees",
        text: "Where each tackle was made, with the ones from your front eight flagged. Possession won and lost, and where every free was given and won.",
      },
      {
        name: "A hurling pitch on the drill board",
        text: `New drills start with a sliotar on a pitch marked at the 13, the 20, the 45 and the ${hurling.line}, and the ready-made drills come the same way.`,
      },
    ],
    screens: [
      {
        name: "Clipping",
        title: "Clip the match.",
        text: "Press C after a score and Ardawn keeps the eight seconds before it and three after. Tag the clip with the player and what happened, then share it with the panel.",
        image: CLIPPING_HURLING,
      },
      {
        name: "Stats",
        title: "Keep the stats.",
        text: "Log tackles, shots, turnovers and puck-outs live from the sideline, by tap or by voice, or after the game from the footage, and see them on a pitch map.",
        image: STATS_SIDELINE,
      },
      {
        name: "Drills",
        title: "Draw the drills.",
        text: "Plan a drill on a hurling pitch, play it back step by step, and send it to the panel as a video.",
        image: DRILL_SLIOTAR,
      },
    ],
    questions: [
      {
        q: "Can we log puck-outs during the match?",
        a: "Yes. Log each poc amach from the line as it happens, by tap or by voice, or go back over them from the footage afterwards. Both are kept on the same stat sheet.",
      },
      { q: "What footage works?", a: FOOTAGE_ANSWER },
      { q: "Do players need to install anything?", a: INSTALL_ANSWER },
      {
        q: "We are a dual club. Does that work?",
        a: "Yes. Each team is its own space on Ardawn with its own panel, footage and code, so your hurlers see hurling's terms and your footballers see football's.",
      },
    ],
  },
  {
    code: "camogie",
    path: "/camogie",
    label: "Camogie",
    named: "camogie",
    title: "Camogie video analysis and stats for clubs: Ardawn",
    description:
      "Analysis platform for camogie clubs and counties. Clip the match for the panel, log every poc amach, shot and turnover on a pitch map, and draw your drills.",
    headline: "The camogie analysis platform for your club.",
    intro:
      "Upload the match and the whole panel can watch it back on their phones. Clip the scores and the turnovers, keep the stat sheet live from the line or afterwards from the footage, and draw the drills for training. Set to camogie's own rules, so a ball put over your own end line is a 45, not a 65.",
    photo: { src: "/home/codes/camogie-2026.webp", focus: "center 18%" },
    features: {
      watch: "Full matches in game time, on any phone or laptop.",
      clip: "Cut out the scores, the wides and the turnovers and send them to the players involved.",
      stats: "Log every poc amach, shot and turnover and see them on a pitch map.",
      drills: "Draw a drill with a sliotar, play it back and share it as a video.",
    },
    rules: [
      {
        name: `The ${camogie.endLineFree}, not the 65`,
        text: `In camogie, a ball put over the end line by a defender gives a ${camogie.endLineFree}, not a 65, and Ardawn's stat sheet says so. You log it as "Won a ${camogie.endLineFree}", and a score from it as coming from a free or ${camogie.endLineFree}. The app follows camogie's rules, not hurling's rules.`,
      },
      {
        name: `The ${camogie.restart.toLowerCase()}`,
        text: "Log whose puck-out it was, how far it went, short, medium or long, and whether the break was won, lost or unclear. Yours and theirs both land on the pitch map.",
      },
      {
        name: "Every shot, from where it was struck",
        text: "From play or a placed ball, yours and theirs: a cúl, a cúilín, a wide, saved or dropped short. The shooting reads back as scored from attempted.",
      },
      {
        name: `Deliveries from inside your ${camogie.line}`,
        text: `Ball struck from inside your own ${camogie.line} to beyond theirs, drawn as an arrow from where it was struck to where it landed, and marked won or lost.`,
      },
      {
        name: "A sliotar on the drill board",
        text: "New drills start with a sliotar, and the ready-made drills come the same way, ready to copy and change.",
      },
    ],
    screens: [
      {
        name: "Clipping",
        title: "Clip the match.",
        text: "Press C after a score and Ardawn keeps the eight seconds before it and three after. Tag the clip with the player and what happened, then share it with the panel, or with just the players involved.",
        image: CLIPPING_CAMOGIE,
      },
      {
        name: "Stats",
        title: "Keep the stats.",
        text: "Log tackles, shots, turnovers and puck-outs live from the sideline, by tap or by voice, or after the game from the footage, and see them on a pitch map.",
        image: STATS_SIDELINE,
      },
      {
        name: "Drills",
        title: "Draw the drills.",
        text: "Plan a drill on the pitch, play it back step by step, and send it to the panel as a video.",
        image: DRILL_SLIOTAR,
      },
    ],
    questions: [
      {
        q: "Is it a hurling app with the name changed?",
        a: "No. A camogie team's stat sheet, tags and drill board follow camogie's rules. The end-line free is a 45, and every screen says so.",
      },
      { q: "What footage works?", a: FOOTAGE_ANSWER },
      { q: "Do players need to install anything?", a: INSTALL_ANSWER },
      {
        q: "Can one club run camogie and ladies football?",
        a: "Yes. Each team is its own space on Ardawn with its own panel, footage and code, and each one sees its own code's terms.",
      },
    ],
  },
  {
    code: "football",
    path: "/gaelic-football",
    label: "Gaelic football",
    named: "Gaelic football",
    title: "Gaelic football video analysis and stats: Ardawn",
    description:
      "Analysis platform for Gaelic football clubs and counties. Clip the match, log kick-outs, marks and two-pointers on a pitch map, and draw your drills.",
    headline: "The Gaelic football analysis platform for your club.",
    intro:
      "Upload the match and the whole panel can watch it back on their phones. Clip the scores and the turnovers, keep the stat sheet live from the line or afterwards from the footage, and draw the drills for training. Built for the game as it is played now, with the two-point arc and the mark.",
    photo: { src: "/home/codes/football-2026.webp" },
    features: {
      watch: "Full matches in game time, on any phone or laptop.",
      clip: "Cut out the scores, the wides and the turnovers and send them to the players involved.",
      stats: "Log every kick-out, shot, mark and turnover and see them on a pitch map.",
      drills: "Draw a drill with a football, play it back and share it as a video.",
    },
    rules: [
      {
        name: "The two-point arc",
        text: "The pitch map draws the 40 m arc, and a point marked outside it counts as two, whether you pressed Point or said it.",
      },
      {
        name: `${football.restarts}`,
        text: "Log whose kick-out it was, how far it went, short, medium or long, and whether the break was won, lost or unclear. Yours and theirs both land on the pitch map.",
      },
      {
        name: "The mark",
        text: "Log every mark, either team's, where it was caught: off a kick-out, or an advanced mark inside the 45.",
      },
      {
        name: `Deliveries from inside your ${football.line}`,
        text: `Ball kicked from inside your own ${football.line} to beyond theirs, drawn as an arrow from where it was struck to where it landed, and marked won or lost.`,
      },
      {
        name: "A football on the drill board",
        text: "New drills start with a football on a football pitch, and the ready-made drills come the same way, ready to copy and change.",
      },
    ],
    screens: [
      {
        name: "Clipping",
        title: "Clip the match.",
        text: "Press C after a score and Ardawn keeps the eight seconds before it and three after. Tag the clip with the player and what happened, then share it with the panel, or with just the players involved.",
        image: CLIPPING_FOOTBALL,
      },
      {
        name: "Stats",
        title: "Keep the stats.",
        text: "Log tackles, shots, turnovers, kick-outs and marks live from the sideline, by tap or by voice, or after the game from the footage, and see them on a pitch map.",
        image: STATS_SIDELINE,
      },
      {
        name: "Drills",
        title: "Draw the drills.",
        text: "Plan a drill on the pitch, play it back step by step, and send it to the panel as a video.",
        image: DRILL_FOOTBALL,
      },
    ],
    questions: [
      {
        q: "Does it count two-pointers?",
        a: "Yes. Mark where the shot was kicked from and a point outside the 40 m arc is counted as two. A score you log as a two-pointer stays a two-pointer.",
      },
      { q: "What footage works?", a: FOOTAGE_ANSWER },
      { q: "Do players need to install anything?", a: INSTALL_ANSWER },
      {
        q: "We are a dual club. Does that work?",
        a: "Yes. Each team is its own space on Ardawn with its own panel, footage and code, so your footballers see kick-outs and 45s and your hurlers see their own game's terms.",
      },
    ],
  },
  {
    code: "ladies_football",
    path: "/ladies-football",
    label: "Ladies football",
    named: "ladies football",
    title: "Ladies Gaelic football video analysis and stats: Ardawn",
    description:
      "Analysis platform for ladies Gaelic football clubs and counties. Clip the match, log kick-outs, marks and two-pointers on a pitch map, and plan training.",
    headline: "The ladies football analysis platform for your club.",
    intro:
      "Upload the match and the whole panel can watch it back on their phones. Clip the scores and the turnovers, keep the stat sheet live from the line or afterwards from the footage, and draw the drills for training. Built for the game as it is played now, with the two-point arc and the mark.",
    photo: { src: "/home/codes/ladies-football-2026.webp", focus: "center 12%" },
    features: {
      watch: "Full matches in game time, on any phone or laptop.",
      clip: "Cut out the scores, the wides and the turnovers and send them to the players involved.",
      stats: "Log every kick-out, shot, mark and turnover and see them on a pitch map.",
      drills: "Draw a drill with a football, play it back and share it as a video.",
    },
    rules: [
      {
        name: "The two-point arc",
        text: "The LGFA brought in the arc in 2026, and the stat sheet counts it. The pitch map draws the 40 m arc, and a point marked outside it counts as two, whether you pressed Point or said it.",
      },
      {
        name: `${ladies.restarts}`,
        text: "Log whose kick-out it was, how far it went, short, medium or long, and whether the break was won, lost or unclear. Yours and theirs both land on the pitch map.",
      },
      {
        name: "The mark",
        text: "Log every mark, either team's, where it was caught: off a kick-out, or an advanced mark inside the 45.",
      },
      {
        name: "Tackles, turnovers and frees",
        text: "Where each tackle was made, with the ones from your front eight flagged. Possession won and lost, and where every free was given and won.",
      },
      {
        name: "A football on the drill board",
        text: "New drills start with a football on a football pitch, and the ready-made drills come the same way, ready to copy and change.",
      },
    ],
    screens: [
      {
        name: "Clipping",
        title: "Clip the match.",
        text: "Press C after a score and Ardawn keeps the eight seconds before it and three after. Tag the clip with the player and what happened, then share it with the panel, or with just the players involved.",
        image: CLIPPING_LADIES,
      },
      {
        name: "Stats",
        title: "Keep the stats.",
        text: "Log tackles, shots, turnovers, kick-outs and marks live from the sideline, by tap or by voice, or after the game from the footage, and see them on a pitch map.",
        image: STATS_SIDELINE,
      },
      {
        name: "Drills",
        title: "Draw the drills.",
        text: "Plan a drill on the pitch, play it back step by step, and send it to the panel as a video.",
        image: DRILL_FOOTBALL,
      },
    ],
    questions: [
      {
        q: "Does it count two-pointers?",
        a: "Yes. Mark where the shot was kicked from and a point outside the 40 m arc is counted as two. A score you log as a two-pointer stays a two-pointer.",
      },
      { q: "What footage works?", a: FOOTAGE_ANSWER },
      { q: "Do players need to install anything?", a: INSTALL_ANSWER },
      {
        q: "Can one club run ladies football and camogie?",
        a: "Yes. Each team is its own space on Ardawn with its own panel, footage and code, and each one sees its own code's terms.",
      },
    ],
  },
];

export function codePage(code: GameCode): CodePage {
  const page = CODE_PAGES.find((p) => p.code === code);
  if (!page) throw new Error(`No page for ${code}`);
  return page;
}

/** Each page's title, description, canonical address and share card. */
export function codePageMetadata(code: GameCode): Metadata {
  const page = codePage(code);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.path },
    ...socialFor(page.title, page.description),
  };
}

/**
 * The trail from the home page to this one, so a result can show
 * "Ardawn > Hurling" under its title instead of the bare address.
 */
export function codePageJsonLd(code: GameCode) {
  const page = codePage(code);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Ardawn", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: page.label, item: `${SITE}${page.path}` },
    ],
  };
}
