import { emailedCode } from "../lib.mjs";

export default {
  slug: "join-your-panel",
  title: "Join your club as a player",
  subtitle: "One team code from your manager, and you are in",
  auth: false,
  start: "/join",
  where: "left",
  async steps(t) {
    const { page } = t;
    const email = `conor.walsh${10 + Math.floor(Math.random() * 89)}@naomhcolm.test`;

    await t.say("Your manager gives you a six character team code. Type it in", 1);
    await t.type("#joinCode", "COLM42", { delay: 130 });

    await t.say("Add your name and email", 2);
    await t.type("#displayName", "Conor Walsh");
    await t.type("#email", email);
    await t.hold(400);

    await t.say("Join the panel", 3);
    await t.click("button:has-text('Join the panel')");
    await page.waitForURL(/\/login\/code/);
    await t.hold(900);

    await t.say("A six digit code arrives by email. Type it in", 4);
    await t.type("#code", await emailedCode(email), { delay: 140 });
    await t.hold(400);
    await t.click("button:has-text('Continue')");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    await t.hold(1800);

    await t.where("bottom");
    await t.say("You are in. Matches, clips and playlists your coaches share are here");
    await t.hold(3800);
  },
};
