import { appDb } from "../lib.mjs";

/**
 * A 3 v 2 that works the way it does on a training pitch: the carrier on the
 * left brings it forward with a team mate running level beside them, the
 * nearest defender has to step out to the carrier, which leaves that team
 * mate free, and the pass puts them through on goal, carrying the ball.
 * Attackers are numbered top to bottom, facing the goal on the right, so
 * Attack 1 is the player on the left.
 */
export default {
  slug: "make-a-drill",
  members: true,
  title: "Draw a training drill",
  subtitle: "Build a 3 v 2 step by step, then play it back",
  start: "/drills",
  width: 1600,
  where: "right",
  // Brisk: this one has the most to show, so every pause is shorter.
  pace: 0.45,
  // Start from an empty drill book, so "New drill" is the obvious thing to press.
  before() {
    const db = appDb();
    db.prepare("delete from drills").run();
    db.close();
  },
  async steps(t) {
    const { page } = t;
    const centre = async (label) => {
      const b = await page.locator(`svg [aria-label="${label}"]`).first().boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    /** Where a piece is, as a fraction across and down the pitch. */
    const spot = async (label) => {
      const c = await centre(label);
      const p = await t.pitch();
      return { fx: (c.x - p.box.x) / p.box.width, fy: (c.y - p.box.y) / p.box.height };
    };
    const to = async (fx, fy) => (await t.pitch()).at(fx, fy);
    const quick = 420;
    /** Drag a piece to a spot on the pitch. */
    const move = async (label, fx, fy) => t.drag(await centre(label), await to(fx, fy), quick);
    /** Move a player and the sliotar together, so the ball is carried and not thrown. */
    const carry = async (label, fx, fy) => {
      const from = await centre(label);
      const ball = await centre("Sliotar");
      const goal = await to(fx, fy);
      await t.drag(from, goal, quick);
      await t.drag(ball, { x: ball.x + (goal.x - from.x), y: ball.y + (goal.y - from.y) }, quick);
    };
    const note = (text) => t.type("input[placeholder^='For example']", text, { delay: 22 });

    await t.say("Open Drills and tap New drill", 1);
    await t.click("button:has-text('New drill')");
    await page.waitForURL(/\/drills\/.+/);
    await t.hold(700);

    await t.say("Give it a name", 2);
    await t.type("input[aria-label='Drill name']", "Working goals in a 3 v 2", { clear: true, delay: 22 });
    // Bring the board and the step controls into one view, and keep them there.
    await t.scroll(170, 700);

    await t.say("Pick a set-up: three attackers against two defenders", 3);
    await t.click("button:has-text('3 v 2')");
    await t.hold(500);

    await t.say("Step 1: say who starts where", 4);
    await t.type("input[placeholder^='Who starts where']", "1 has the ball on the left", { delay: 22 });

    // Step 2: 1 carries it, 2 runs level beside them, the nearest defender steps out to 1.
    await t.say("Add a step and drag the players to where they move next", 5);
    await t.click("button:text-is('Add step')");
    const a1 = await spot("Attack 1");
    const a2 = await spot("Attack 2");
    const forward = 0.13;
    await carry("Attack 1", a1.fx + forward, a1.fy);
    await move("Attack 2", a1.fx + forward, a2.fy);
    await move("Defence 1", a1.fx + forward + 0.045, a1.fy + 0.03);
    await note("1 carries it, 2 runs level, defender 1 closes in");

    // Step 3: the defender is committed, so 2 is free to take the pass.
    await t.say("Defender 1 has committed, so 2 is free. Pass to them", 6);
    await t.click("button:text-is('Add step')");
    const at2 = await centre("Attack 2");
    await t.drag(await centre("Sliotar"), { x: at2.x + 16, y: at2.y }, quick);
    await note("1 passes to 2");

    // Step 4: 2 runs through on goal with the ball.
    await t.say("Now 2 runs at goal with the ball", 7);
    await t.click("button:text-is('Add step')");
    const d2 = await spot("Defence 2");
    const run = await spot("Attack 2");
    await carry("Attack 2", 0.93, run.fy);
    await move("Defence 2", Math.max(d2.fx - 0.03, 0.88), run.fy + 0.08);
    await note("2 runs through and scores");

    await t.say("Play it back, step by step", 8);
    await t.click("button:has-text('Play drill')");
    // The board plays at its own pace: 1.4 seconds a step.
    await page.waitForTimeout(4900);

    await t.where("left");
    await t.say("Add coaching points for the players", 9);
    await t.type(
      "textarea[placeholder^='What the drill is for']",
      "Working goals in a 3 v 2: use line of sight and the overlap.",
      { delay: 18 },
    );
    await t.hold(900);
  },
};
