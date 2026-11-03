import { appDb, ids } from "../lib.mjs";

const { played } = ids();

export default {
  slug: "after-the-match-stats",
  members: true,
  title: "After the match: share the stat sheet",
  subtitle: "Name the numbers, submit, and the whole panel can read it",
  start: `/matches/${played}/stats`,
  width: 1600,
  where: "left",
  // The sheet is typed up but not yet shared with the panel.
  before() {
    const db = appDb();
    db.prepare("update matches set stats_submitted_at = null where id = ?").run(played);
    db.close();
  },
  async steps(t) {
    const { page } = t;
    await t.hold(900);

    await t.say("Your sheet is only yours until you submit it", 1);
    await t.ring("text=Only coaches can see this sheet so far");
    await t.hold(2400);
    await t.unring();

    await t.say("Stats are logged by jersey number. Put a name to each one", 2);
    await t.click("a:has-text('Put names to numbers')");
    await page.waitForURL(/\/numbers/);
    await t.hold(1000);
    await t.ring("select >> nth=7");
    await t.hold(2200);
    await t.unring();
    await t.scroll(500, 1600);
    await t.hold(600);

    await t.say("Every entry for that number now belongs to that player", 3);
    await t.click("a:has-text('See the report')");
    await page.waitForURL(/\/stats$/);
    await t.hold(900);

    await t.say("When everyone logging has finished, submit it to the panel", 4);
    await t.click("button:has-text('Submit to the panel')");
    await t.hold(900);
    await t.ring("text=The panel can see this sheet");
    await t.hold(2400);
    await t.unring();

    await t.where("bottom");
    await t.say("Now every player can read it, and their own line in the table", 5);
    await t.scroll(560, 1800);
    await t.hold(2200);
    await t.scroll(620, 1800);
    await t.hold(2200);
    await t.say("Every shot, restart and delivery is on the pitch, split by half", 6);
    await t.scroll(900, 2200);
    await t.hold(2400);
    await t.scroll(900, 2200);
    await t.hold(2000);
  },
};
