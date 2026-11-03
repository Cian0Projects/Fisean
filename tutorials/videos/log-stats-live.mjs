import { appDb, ids } from "../lib.mjs";

const { live } = ids();

export default {
  slug: "log-stats-live",
  members: true,
  title: "Log stats during a match",
  subtitle: "Tackles, shots and restarts from the line, in a few taps each",
  start: `/matches/${live}/stats/log`,
  width: 1600,
  where: "left",
  // A little brisker than the rest: the voice step is extra, so the video should not grow.
  pace: 0.8,
  // Nothing logged and no clock running, as on the morning of a match.
  before() {
    const db = appDb();
    db.prepare("delete from stat_clocks where match_id = ?").run(live);
    db.prepare("delete from match_stats where match_id = ?").run(live);
    db.close();
  },
  async steps(t) {
    const { page } = t;
    await t.hold(600);

    await t.say("Tap Throw-in at the first whistle. Every entry takes its time from this clock", 1);
    await t.click("button:text-is('Throw-in')");
    await t.hold(1500);

    // A tackle: what, where, who.
    await t.say("Pick what happened, then tap the pitch where it was", 2);
    await t.click("button:has-text('Tackle')");
    let pitch = await t.pitch();
    const tackle = pitch.at(0.46, 0.38);
    await t.clickAt(tackle.x, tackle.y);
    await t.say("Add the player's number. Their name fills in", 3);
    await t.type(page.getByLabel("Tackle by"), "8");
    await t.hold(500);
    await t.click("button:has-text('Log this tackle')");
    await t.hold(800);

    // A shot, picked with its number key.
    await t.say("Number keys switch type. 4 is a shot");
    await t.press("4", 700);
    pitch = await t.pitch();
    const shot = pitch.at(0.86, 0.47);
    await t.clickAt(shot.x, shot.y);
    await t.say("Tap how it ended, then who took it", 4);
    await t.click("button:has-text('Cúilín')");
    await t.type(page.getByLabel("Player", { exact: true }), "10");
    await t.hold(400);
    await t.click("button:has-text('Log this shot')");
    await t.hold(800);

    // A poc amach.
    await t.say("Restarts work the same way. Whose it was, how far, who won it", 5);
    await t.press("6", 700);
    await t.click("button:text-is('Mid')");
    await t.click("button:has-text('We won it')");
    await t.type(page.getByLabel("Won by"), "9");
    await t.click("button:has-text('Log this poc amach')");
    await t.hold(800);

    // One by voice. A recording browser has no microphone, so a stand-in for the
    // browser's speech engine "hears" the coach, word by word, as it would.
    await page.evaluate(() => {
      class Heard {
        start() {
          const say = (ms, text) => setTimeout(() => !this.dead && this.onresult?.({ results: [[{ transcript: text }]] }), ms);
          setTimeout(() => !this.dead && this.onaudiostart?.(), 250);
          say(800, "shot");
          say(1400, "shot seven");
          say(2000, "shot seven point");
        }
        abort() {
          this.dead = true;
        }
      }
      for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
        Object.defineProperty(window, name, { value: Heard, configurable: true, writable: true });
      }
    });
    await t.say("Or say it. Tap Say it, then speak: shot, seven, point", 6);
    await t.click("button:has-text('Say it')");
    await page.waitForTimeout(2500);
    await t.say("It fills in the form. Tap the pitch and log it", 7);
    pitch = await t.pitch();
    const voiced = pitch.at(0.82, 0.55);
    await t.clickAt(voiced.x, voiced.y);
    await t.click("button:has-text('Log this shot')");
    await t.hold(600);

    await t.where("right");
    await t.say("Everything you log is listed here, and any entry can be fixed", 8);
    await t.ring("h2:has-text('Your stats so far')");
    await t.hold(2800);
    await t.unring();

    await t.say("At the whistle, tap Half time, then Second half, then Full time", 9);
    await t.click("button:text-is('Half time')");
    await t.hold(2600);
  },
};
