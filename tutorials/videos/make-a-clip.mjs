import { appDb, ids } from "../lib.mjs";

const { video } = ids();

export default {
  slug: "make-a-clip",
  members: true,
  title: "Clip a moment from the match",
  subtitle: "Capture it, name it, trim it and share it with the panel",
  start: `/review/${video}`,
  width: 1600,
  where: "top",
  // No clips yet, so the first one is the one this video makes.
  before() {
    const db = appDb();
    db.prepare("delete from clips").run();
    db.close();
  },
  async steps(t) {
    const { page } = t;
    await t.hold(800);

    // The goal is scored about 15 seconds into this footage, so the video
    // starts the way a coach would: skip along to just before it, then play.
    await t.say("Click the timeline to jump to the part you want to watch", 1);
    const track = await t.glide("div.cursor-pointer.touch-none.select-none");
    await t.clickAt(track.box.x + track.box.width * 0.54, track.y);
    await t.hold(700);

    await t.say("Press Play and watch it", 2);
    await t.click(page.getByRole("button", { name: /^Play/ }));
    // Let the ball go in, then react a moment later, as someone watching would.
    await page.waitForFunction(() => (document.querySelector("video")?.currentTime ?? 0) > 16.2);

    await t.say("Goal! Tap Quick clip straight after. It keeps the last 8 seconds", 3);
    await t.click(page.getByRole("button", { name: /Quick clip/ }));
    await t.hold(1400);

    await t.say("Your clip is in the list. Open it", 4);
    await t.click("text=Untitled clip");
    await t.hold(800);

    await t.say("Say what happened", 5);
    await t.type("input[placeholder='What happens here?']", "Goal from the rebound");
    await t.hold(700);

    await t.say("Trim it so it starts and ends where you want", 6);
    await t.ring("text=Trim >> xpath=ancestor::div[1]");
    await t.hold(2600);
    await t.unring();

    await t.say("Choose who can see it. All players puts it in front of the panel", 7);
    await t.click("button:text-is('All players')");
    await t.hold(1400);

    await t.say("Tag the players in it, and they find it on their own page", 8);
    await t.click("button:text-is('Tadhg Nolan')");
    await t.hold(900);
    await t.click("button:text-is('Cathal Byrne')");
    await t.hold(2200);
  },
};
