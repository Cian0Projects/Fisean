import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseSpeech, parseSpokenStat, speechScore } from "../src/lib/hurling/voice.ts";

test("number words become digits, tens and units together", () => {
  assert.deepEqual(normaliseSpeech("Number twenty-one, sixty five"), ["number", "21", "65"]);
  assert.deepEqual(normaliseSpeech("Cúl"), ["cul"]);
});

test("a misheard number is only trusted after 'number'", () => {
  assert.equal(parseSpokenStat("tackle number for", "shot").fields.playerNumber, "4");
  assert.equal(parseSpokenStat("number ate", "tackle").fields.playerNumber, "8");
  // "won" anywhere else is an outcome, not a 1.
  const t = parseSpokenStat("turnover won", "tackle");
  assert.equal(t.fields.playerNumber, undefined);
  assert.equal(t.fields.outcome, "positive");
});

test("shot seven point, in one breath or as the engine hears it", () => {
  for (const said of ["shot seven point", "Shot number 7. Point", "shot 7 over the bar"]) {
    const s = parseSpokenStat(said, "tackle");
    assert.equal(s.statType, "shot");
    assert.equal(s.fields.playerNumber, "7");
    assert.equal(s.fields.shotResult, "point");
  }
});

test("a misheard type is trusted as the first word, and only there", () => {
  for (const said of ["shop seven", "Shut number 7", "um shout 7", "right, shock seven"]) {
    const s = parseSpokenStat(said, "tackle");
    assert.equal(s.statType, "shot", said);
    assert.equal(s.typeSaid, true, said);
    assert.equal(s.fields.playerNumber, "7", said);
  }
  assert.equal(parseSpokenStat("pocket ours long", "shot").statType, "puckout");
  assert.equal(parseSpokenStat("tickle 4", "shot").statType, "tackle");
  // After a "scrap that", the next word is first again.
  assert.equal(parseSpokenStat("tackle 4 scrap that shop 9", "tackle").statType, "shot");
  // Later in a sentence it is just a word.
  assert.equal(parseSpokenStat("delivery 7 to 9 shop", "tackle").statType, "delivery");
  assert.equal(parseSpokenStat("7 shop", "tackle").statType, "tackle");
  const firsts = {
    shot: ["shop 7", "scott 7", "jot 7"],
    tackle: ["attack 7", "taco 7", "tickle number 7"],
    delivery: ["past 7 to 9", "livery 7", "bowl in 7"],
    turnover: ["turn off 7", "turnip 7"],
    puckout: ["pocket ours", "puck a mock ours", "kick it out ours", "pick out ours"],
    free_won: ["free one 7", "free win 7", "fold 7"],
    free_conceded: ["free conceited 7", "free concealed 7"],
  };
  for (const [type, phrases] of Object.entries(firsts)) {
    // Start the form on another type, so only the words can have set it.
    const current = type === "tackle" ? "shot" : "tackle";
    for (const said of phrases) assert.equal(parseSpokenStat(said, current).statType, type, said);
  }
  // "Free one" is a free won, not a free by number 1.
  assert.equal(parseSpokenStat("free one 7", "shot").fields.playerNumber, "7");
  // "Past the 65" is still a poc amach worked out, not a pass.
  const worked = parseSpokenStat("past the 65", "puckout");
  assert.equal(worked.statType, "puckout");
  assert.equal(worked.fields.pastSixtyFive, true);
  // A word the table already knows keeps its meaning, first or not.
  const p = parseSpokenStat("short ours won", "puckout");
  assert.equal(p.statType, "puckout");
  assert.equal(p.fields.puckoutLength, "short");
});

test("won, as the engine writes it, is a win and not number 1", () => {
  for (const said of ["we won turnover", "we one turnover", "turnover 7 we one", "turnover seven one it", "turnover seven one"]) {
    const t = parseSpokenStat(said, "tackle");
    assert.equal(t.statType, "turnover", said);
    assert.equal(t.fields.outcome, "positive", said);
    assert.notEqual(t.fields.playerNumber, "1", said);
  }
  assert.equal(parseSpokenStat("turnover seven one", "tackle").fields.playerNumber, "7");
  assert.equal(parseSpokenStat("puckout ours they one it", "shot").fields.outcome, "negative");
  // One on its own is still the keeper, and a tackle has nobody to win.
  assert.equal(parseSpokenStat("turnover one", "tackle").fields.playerNumber, "1");
  assert.equal(parseSpokenStat("tackle seven one", "shot").fields.playerNumber, "1");
});

test("puck out as the engine hears it", () => {
  for (const said of ["bookhouse ours long", "book house ours long", "Bookhouse, ours, long"]) {
    const p = parseSpokenStat(said, "shot");
    assert.equal(p.statType, "puckout", said);
    assert.equal(p.fields.puckoutLength, "long", said);
  }
  // Anywhere in the sentence, since it means nothing else.
  assert.equal(parseSpokenStat("shot 11 point from a bookhouse", "tackle").fields.attemptSource, "puckout");
});

test("a result names the type by itself", () => {
  const s = parseSpokenStat("seven wide", "tackle");
  assert.equal(s.statType, "shot");
  assert.equal(s.typeSaid, false);
  assert.equal(s.fields.shotResult, "wide");
});

test("from a free, from a 65 and from a puckout describe the shot, not a new stat", () => {
  const free = parseSpokenStat("shot 14 point from a free", "shot");
  assert.equal(free.fields.shotKind, "free");
  assert.equal(free.fields.shotResult, "point");

  const placed = parseSpokenStat("point from a 65", "shot");
  assert.equal(placed.fields.shotKind, "free");
  assert.equal(placed.fields.shotResult, "point");

  const source = parseSpokenStat("shot eleven goal off the puckout", "tackle");
  assert.equal(source.statType, "shot");
  assert.equal(source.fields.attemptSource, "puckout");
  assert.equal(source.fields.shotResult, "goal");
});

test("their shot, and a 65 won", () => {
  const s = parseSpokenStat("their shot 65", "shot");
  assert.equal(s.fields.side, "opposition");
  assert.equal(s.fields.shotResult, "sixty_five");
});

test("dropped short is a result only once it is said who kept it", () => {
  assert.equal(parseSpokenStat("shot dropped short", "shot").fields.shotResult, undefined);
  assert.equal(parseSpokenStat("shot dropped short lost", "shot").fields.shotResult, "lost");
  assert.equal(parseSpokenStat("shot short kept it", "shot").fields.shotResult, "retained");
});

test("many words for a delivery, struck by then aimed at", () => {
  for (const said of ["delivery seven to eleven won", "pass 7 to 11 caught", "ball in seven eleven good"]) {
    const s = parseSpokenStat(said, "tackle");
    assert.equal(s.statType, "delivery");
    assert.equal(s.fields.playerNumber, "7");
    assert.equal(s.fields.targetNumber, "11");
    assert.equal(s.fields.outcome, "positive");
  }
});

test("a poc amach: whose, how far, who won the break", () => {
  const s = parseSpokenStat("their puckout long we won it, number six", "tackle");
  assert.equal(s.statType, "puckout");
  assert.equal(s.fields.puckoutTakenBy, "opposition");
  assert.equal(s.fields.puckoutLength, "long");
  assert.equal(s.fields.outcome, "positive");
  assert.equal(s.fields.playerNumber, "6");

  const ours = parseSpokenStat("our kickout, a short one, broke", "tackle");
  assert.equal(ours.fields.puckoutTakenBy, "us");
  assert.equal(ours.fields.puckoutLength, "short");
  assert.equal(ours.fields.outcome, "unclear");
  assert.equal(ours.fields.playerNumber, undefined);
});

test("turnovers: how, and scoring from one means we won it", () => {
  const lost = parseSpokenStat("turnover unforced number nine", "shot");
  assert.equal(lost.fields.possession, "unforced");
  assert.equal(lost.fields.outcome, "negative");

  const scored = parseSpokenStat("turnover 60 40, scored from it", "shot");
  assert.equal(scored.fields.possession, "sixty_forty");
  assert.equal(scored.fields.ledToScore, true);
  assert.equal(scored.fields.outcome, "positive");
});

test("frees won and conceded are told apart", () => {
  assert.equal(parseSpokenStat("free won number 10", "shot").statType, "free_won");
  assert.equal(parseSpokenStat("won a free", "shot").statType, "free_won");
  const c = parseSpokenStat("free conceded by four, in range", "shot");
  assert.equal(c.statType, "free_conceded");
  assert.equal(c.fields.scorable, true);
  assert.equal(c.fields.playerNumber, "4");
});

test("the later word wins, so a correction mid-sentence lands", () => {
  const s = parseSpokenStat("shot seven, eight, wide no point", "shot");
  assert.equal(s.fields.playerNumber, "8");
  assert.equal(s.fields.shotResult, "point");
});

test("scrap that keeps only what came after it", () => {
  const s = parseSpokenStat("shot seven point scrap that tackle twelve front eight", "shot");
  assert.equal(s.resets, 1);
  assert.equal(s.statType, "tackle");
  assert.equal(s.fields.playerNumber, "12");
  assert.equal(s.fields.frontEight, true);
  assert.equal(s.fields.shotResult, undefined);

  const empty = parseSpokenStat("shot seven, cancel", "turnover");
  assert.equal(empty.resets, 1);
  assert.equal(empty.statType, "turnover");
  assert.equal(empty.hits, 0);
});

test("nothing understood leaves the form alone", () => {
  const s = parseSpokenStat("ah would you look at that", "delivery");
  assert.equal(s.hits, 0);
  assert.equal(s.statType, "delivery");
  assert.deepEqual(s.fields, {});
});

test("a guess that makes more sense scores higher", () => {
  assert.ok(speechScore("shot seven point") > speechScore("shop seven pint"));
});
