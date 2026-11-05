/**
 * The public how-to pages at /how-to: each one a task a coach searches for
 * before they have an account, written out in words with a still of the app.
 *
 * The videos stay for members. Four of these pages walk through the same
 * task as a members' video (src/lib/guides.ts), step for step from its script
 * in tutorials/videos/, and say that members can watch it; the picture is
 * that video's poster, a still of the real app with the step's caption on it.
 * The fifth, bringing footage across from Veo and the rest, has no video and
 * no picture, and is there because it is what a club with a camera already
 * searches for.
 *
 * The copy keeps the app's rules. Button names are written as the app shows
 * them, so a coach following along finds them. Nothing is promised that the
 * code does not do. It is written for every code, since every code does
 * these things the same way: "the restart" where it would otherwise say
 * poc amach or kick-out, and both named where the difference matters.
 *
 * Pure data, held to its rules by tests/how-to.test.mjs.
 */
import type { Metadata } from "next";
import { SITE, socialFor } from "./seo";

export type HowToStep = { title: string; text: string };

export type HowTo = {
  slug: string;
  /** The page's heading, and its name in the list of guides. */
  heading: string;
  /** What a results page shows: at most 60 characters. */
  title: string;
  /** 120 to 160 characters. */
  description: string;
  /** One line for the list of guides. */
  blurb: string;
  intro: string;
  image?: { src: string; alt: string };
  /** Who does this in Ardawn. */
  who: string;
  steps: HowToStep[];
  /** What else is worth knowing, after the steps. */
  tips: HowToStep[];
  /** The members' video that shows the same task, by its slug in guides.ts. */
  video?: string;
};

export const HOW_TOS: readonly HowTo[] = [
  {
    slug: "clip-a-match",
    heading: "How to clip a match and share it with your players",
    title: "How to clip GAA match footage and share it: Ardawn",
    description:
      "Cut the key moments out of a GAA match video, say what happened, trim them and send them to the players involved, on a laptop or a phone.",
    blurb: "Cut out a moment, name it, trim it and send it to the players in it.",
    intro:
      "A clip is a short piece of the match: a score, a turnover, a tackle that should have been made. This is how to make one in Ardawn and get it in front of the players who need to see it.",
    image: {
      src: "/home/how-to/clip-a-match.jpg",
      alt: "The review screen with a match playing, the Quick clip button pressed below it, and the new clip listed beside the video.",
    },
    who: "Anyone on the panel can clip a match. Coaches and players alike.",
    steps: [
      {
        title: "Open the match and find the moment",
        text: "Click the timeline under the video to jump to that part of the game, then press Play and watch it.",
      },
      {
        title: "Press Quick clip straight after it happens",
        text: "Or press C on the keyboard. Ardawn keeps the 8 seconds before and 3 after, because you only react once the moment has passed. The Pre-roll slider beside the button sets how far back it reaches, from 2 to 20 seconds.",
      },
      {
        title: "Open the clip and say what happened",
        text: "It appears in the list of clips beside the video. Give it a title the players will understand, such as the score it led to or the mistake in it.",
      },
      {
        title: "Trim it",
        text: "Move the start and the end so the clip begins and stops exactly where you want.",
      },
      {
        title: "Choose who can see it",
        text: "Every clip starts private, set to Just me. Choose All players to put it in front of the panel, or use Or pick people to send it to just the players involved.",
      },
      {
        title: "Tag the players in it",
        text: "Each player you tag finds the clip on their own page, so nobody has to scroll through the whole match for their moments.",
      },
    ],
    tips: [
      {
        title: "On a phone",
        text: "Tap Clip that after the moment and a sheet opens with the same 8 seconds before and 3 after, ready to trim and name. Or tap to start a clip, let it play, and tap again to end it.",
      },
      {
        title: "Send a set of clips together",
        text: "Put clips into a playlist, such as every restart lost in the second half, and share it with the panel or a few players. Send it to players by name and you can see which of them have watched it.",
      },
    ],
    video: "make-a-clip",
  },
  {
    slug: "log-stats-during-a-match",
    heading: "How to log stats during a match",
    title: "How to log GAA match stats live from the sideline: Ardawn",
    description:
      "Keep a GAA stat sheet from the sideline on a phone or tablet: tackles, shots, turnovers and restarts in a few taps each, or by voice.",
    blurb: "Tackles, shots, turnovers and restarts from the line, by tap or by voice.",
    intro:
      "The stat sheet is kept on a phone, tablet or laptop, live from the sideline or afterwards from the footage. Each stat takes a few taps: what happened, where on the pitch, and who.",
    image: {
      src: "/home/how-to/log-stats-during-a-match.jpg",
      alt: "The stat sheet: a pitch with a shot marked on it, and beside it the buttons for the type of stat, whose shot it was, where it came from and how it ended.",
    },
    who: "Coaches keep the stat sheet. More than one can log the same match.",
    steps: [
      {
        title: "Tap Throw-in at the first whistle",
        text: "Every entry takes its time in the game from this clock, so each stat can be found again on the footage.",
      },
      {
        title: "Pick what happened, then tap the pitch where it was",
        text: "Tackle, delivery, turnover, shot, free conceded, free won and the restart, and in football the mark too. On a keyboard the number keys pick them: 4 is a shot.",
      },
      {
        title: "Add the player's number",
        text: "Their name fills in from the panel.",
      },
      {
        title: "Tap how it ended",
        text: "For a shot that is a score, a wide, saved, and the rest. Then log it.",
      },
      {
        title: "Restarts work the same way",
        text: "Whose it was, how far it went, and who won it. In hurling and camogie that is the poc amach; in football, the kick-out.",
      },
      {
        title: "Or say it",
        text: "Tap Say it and speak, for example: shot, seven, point. The form fills itself in. Tap the pitch where it happened and log it.",
      },
      {
        title: "Fix anything as you go",
        text: "Everything you log is listed under the form, and any entry can be changed.",
      },
      {
        title: "Mark the halves",
        text: "At the whistle, tap Half time, then Second half, then Full time.",
      },
    ],
    tips: [
      {
        title: "Not at the match?",
        text: "Log the same sheet afterwards from the footage. Pause, Back 15s and Forward 15s move through the game as you go.",
      },
    ],
    video: "log-stats-live",
  },
  {
    slug: "share-the-stat-sheet",
    heading: "How to share the stat sheet with the panel",
    title: "How to share GAA match stats with your panel: Ardawn",
    description:
      "After the match, put names to the numbers, submit the stat sheet, and every player can read the report, their own line and the pitch map.",
    blurb: "Put names to the numbers, submit it, and the whole panel can read it.",
    intro:
      "Once the match is logged, the stat sheet becomes a report the whole panel can read: the score, the scorers, the shooting, every player's own line and the pitch map. This is how to get it to them.",
    image: {
      src: "/home/how-to/share-the-stat-sheet.jpg",
      alt: "A stat sheet report: the final score, the scorers, the Submit to the panel button, and each team's shooting below.",
    },
    who: "Coaches put names to numbers and submit the sheet. Every player can read it once it is submitted.",
    steps: [
      {
        title: "The sheet is yours until you submit it",
        text: "While the match is being logged, only coaches can see it, so a half finished sheet never reaches the panel.",
      },
      {
        title: "Put names to numbers",
        text: "Stats are logged by jersey number. Press Put names to numbers and name each one. Every entry for that number then belongs to that player.",
      },
      {
        title: "Submit it to the panel",
        text: "When everyone logging the match has finished, press Submit to the panel.",
      },
      {
        title: "Every player can read it",
        text: "The report shows the score, the scorers, the shooting from play and from frees, and a line in the table for each player. Every shot, restart and delivery is on the pitch, split by half.",
      },
    ],
    tips: [
      {
        title: "On paper",
        text: "Press Print or Save as PDF on the same page for a copy to hand out or keep.",
      },
    ],
    video: "after-the-match-stats",
  },
  {
    slug: "draw-a-training-drill",
    heading: "How to draw a training drill",
    title: "How to draw a GAA training drill and share it: Ardawn",
    description:
      "Plan a training drill on a GAA pitch step by step, play it back, add coaching points and send it to the panel as a video before the session.",
    blurb: "Set it up, move the players step by step, play it back and send it as a video.",
    intro:
      "The drill board is a pitch you move players and the ball around on, one step at a time. Here a 3 v 2 is drawn from scratch, but any drill works the same way.",
    image: {
      src: "/home/how-to/draw-a-training-drill.jpg",
      alt: "The drill board: attackers and defenders on a pitch with arrows showing where each moved, the steps listed below, and the set-up options beside it.",
    },
    who: "Coaches draw drills and share them with the panel.",
    steps: [
      {
        title: "Open Drills and tap New drill",
        text: "Give the drill a name the panel will recognise.",
      },
      {
        title: "Pick a set-up",
        text: "Quick set-ups go from 1 v 1 to 15 v 15, or set the number on each side yourself. Here it is three attackers against two defenders.",
      },
      {
        title: "Step 1: say who starts where",
        text: "Drag each player and the ball into place, and write what happens in the step.",
      },
      {
        title: "Add a step and drag the players to where they move next",
        text: "A dashed ghost shows where each one stood before, and an arrow shows the run. Keep adding steps until the drill is done.",
      },
      {
        title: "Play it back",
        text: "Press Play drill to watch it move step by step, at half speed, normal or double.",
      },
      {
        title: "Add coaching points",
        text: "What the drill is for, and what to watch for, for the players to read before the session.",
      },
      {
        title: "Send it as a video",
        text: "Press Export video and the drill is made into a video to share with the panel.",
      },
    ],
    tips: [
      {
        title: "Start from a ready-made drill",
        text: "Ardawn comes with ready-made drills for attacking, defending, skills, games and warm ups. Copy one and change it to suit. They come with your own code's ball, a sliotar or a football.",
      },
    ],
    video: "make-a-drill",
  },
  {
    slug: "import-footage-from-veo",
    heading: "How to bring match footage across from Veo, Pixellot, Hudl or Google Drive",
    title: "Bring Veo, Pixellot or Hudl match footage across: Ardawn",
    description:
      "Move a match from Veo, Pixellot, Hudl, Spiideo, Google Drive or Dropbox into Ardawn by pasting its download link, without downloading it first.",
    blurb: "Paste the download link and Ardawn fetches the match itself.",
    intro:
      "If your club's matches are already on Veo, Pixellot, Hudl, Spiideo, Google Drive or Dropbox, there is no need to download them and upload them again. Paste each match's download link and Ardawn fetches the file itself.",
    who: "Coaches and the club admin bring footage in.",
    steps: [
      {
        title: "Get the download link for the match",
        text: "Not the page for the match, but the link to the video file. In Veo, press Download, then Download full game, and copy the link of that download. From Pixellot, request an HD export of the game and copy the link from the email Pixellot sends. From Hudl, ask Hudl to download the game and copy the link from its email. In Spiideo, make a download of the game and copy its link. In Google Drive or Dropbox, share the file so anyone with the link can view it, then copy the link.",
      },
      {
        title: "Open Squad and find Footage",
        text: "Beside Matches already on Veo, Pixellot, Hudl, Spiideo, Google Drive or Dropbox, press Bring them across.",
      },
      {
        title: "Paste the links",
        text: "As many as you have, one per line. You can paste a whole email with the link in it. If a link opens a web page rather than the video, Ardawn says so and tells you where that site keeps the real link.",
      },
      {
        title: "Check who you played and when",
        text: "Ardawn guesses the match from the file's name, so mostly you only confirm it. Change anything it got wrong.",
      },
      {
        title: "Press Bring this match across",
        text: "Ardawn fetches the file straight from the other site into your club's storage, so nothing goes through your computer and you can close the page once it starts. When it is in, the whole panel can watch it.",
      },
    ],
    tips: [
      {
        title: "Already have the file?",
        text: "Any match saved as an MP4 can be uploaded on the same page. If a long upload stops on club WiFi, drop the same file in again and it carries on from where it was.",
      },
    ],
  },
];

export function howTo(slug: string): HowTo | undefined {
  return HOW_TOS.find((h) => h.slug === slug);
}

export const HOW_TO_INDEX = {
  path: "/how-to",
  title: "How to use Ardawn: guides for GAA clubs",
  description:
    "Step by step guides to clipping a match, logging stats from the sideline, sharing the stat sheet, drawing drills and bringing in footage from Veo.",
};

export function howToIndexMetadata(): Metadata {
  const { path, title, description } = HOW_TO_INDEX;
  return { title, description, alternates: { canonical: path }, ...socialFor(title, description) };
}

export function howToMetadata(h: HowTo): Metadata {
  return {
    title: h.title,
    description: h.description,
    alternates: { canonical: `/how-to/${h.slug}` },
    ...socialFor(h.title, h.description),
  };
}

/** Ardawn > How to > this guide, for the trail under a search result. */
export function howToJsonLd(h?: HowTo) {
  const trail = [
    { name: "Ardawn", item: `${SITE}/` },
    { name: "How to", item: `${SITE}/how-to` },
    ...(h ? [{ name: h.heading, item: `${SITE}/how-to/${h.slug}` }] : []),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, ...t })),
  };
}
