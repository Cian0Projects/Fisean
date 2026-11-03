import { emailedCode } from "../lib.mjs";

export default {
  slug: "set-up-your-club",
  title: "Set up your club",
  subtitle: "Make your space on Ardawn in about a minute",
  auth: false,
  start: "/start",
  where: "left",
  async steps(t) {
    const { page } = t;
    // A different address each run: sign-in codes are limited per address.
    const email = `mairead.kelly${10 + Math.floor(Math.random() * 89)}@cluainmhuire.test`;

    await t.say("Choose club or county", 1);
    await t.click("label:has-text('Club')");

    await t.say("Add your club's name and the game your first team plays", 2);
    await t.type("#teamName", "Cluain Mhuire");
    await t.click("#code");
    await page.selectOption("#code", "hurling");
    await t.hold(700);

    await t.say("Then your name and email. You will be the admin", 3);
    await t.type("#displayName", "Mairéad Kelly");
    await t.type("#email", email);
    await t.hold(500);

    await t.say("Set up the club", 4);
    await t.click("button:has-text('Set up the club')");
    await page.waitForURL(/\/login\/code/);
    await t.hold(900);

    await t.say("A six digit code arrives by email. Type it in", 5);
    const code = await emailedCode(email);
    await t.type("#code", code, { delay: 140 });
    await t.hold(400);
    await t.click("button:has-text('Continue')");
    await page.waitForURL(/\/start\/waiting/);
    await t.hold(1200);

    await t.say("We check every new club before it opens, usually within a day");
    await t.hold(3800);
  },
};
