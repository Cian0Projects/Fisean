/**
 * What every how-to video shares: a browser, a visible cursor that glides
 * rather than teleports, step captions, a title card and an end card, and a
 * recorder that turns it all into an mp4.
 *
 * Playwright's own recordVideo is a low bitrate VP8 stream, which smears the
 * small type this app is made of. So frames come from Chrome's screencast
 * instead, as 1920 by 1080 JPEGs with the time each one appeared, and ffmpeg
 * stitches them at 30 fps. The page is laid out at 1280 by 720 and rendered at
 * 1.5 times, which is what makes the text crisp without making it tiny.
 *
 * Everything drawn on top (cursor, ripple, caption, cards) is a DOM element
 * injected into the page, so it is in the picture exactly because it is in
 * the page. It survives navigation by keeping its state in sessionStorage.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

export const BASE = process.env.TUTORIAL_BASE ?? "http://localhost:3131";
const HERE = import.meta.dirname;
const WORK = process.env.TUTORIAL_WORK ?? join(HERE, ".work");
/** Public videos are plain files; members only ones sit outside public/, where only the app can serve them. */
const PUBLIC_OUT = resolve(HERE, "../public/guides");
const MEMBERS_OUT = resolve(HERE, "../content/guides");
/** The picture is always 1920 by 1080; the page is laid out at `width` css pixels and drawn at 1920 / width. */
const OUT_W = 1920;
const OUT_H = 1080;

/**
 * The throwaway database, for putting things back as a video found them so a
 * video can be recorded again. Opens the app's own sqlite file (WAL mode, so
 * it is safe beside the running server).
 */
export function appDb() {
  const Database = createRequire(join(HERE, "../package.json"))("better-sqlite3");
  return new Database(join(WORK, "tutorial.db"));
}

export const ids = () => JSON.parse(readFileSync(join(WORK, "ids.json"), "utf8"));
export const outboxDir = () => join(WORK, "outbox");

/**
 * The six digit code the app just emailed to an address, read from the local
 * outbox (every `.test` address goes there, see src/lib/mail/local.ts).
 */
export async function emailedCode(email) {
  const want = email.replace(/[^a-z0-9@._]/gi, "_");
  for (let i = 0; i < 40; i++) {
    const files = existsSync(outboxDir()) ? readdirSync(outboxDir()).filter((f) => f.endsWith(`-${want}.html`)).sort() : [];
    const last = files.at(-1);
    if (last) {
      const m = readFileSync(join(outboxDir(), last), "utf8").match(/letter-spacing:0\.15em[^>]*>\s*(\d{3} ?\d{3})\s*</);
      if (m) return m[1].replace(/\s/g, "");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No code arrived for ${email}`);
}

/** Runs inside every page. Plain strings of CSS and JS: nothing here is the app's code. */
const overlay = (scale) => {
  const css = `
  #__t_cap,#__t_card{zoom:${scale}}
  #__t_cursor{position:fixed;left:0;top:0;width:${30 * scale}px;height:${30 * scale}px;z-index:2147483647;pointer-events:none;
    transform:translate(-100px,-100px);filter:drop-shadow(0 3px 5px rgba(0,0,0,.55));will-change:transform}
  .__t_ripple{position:fixed;z-index:2147483646;pointer-events:none;width:${14 * scale}px;height:${14 * scale}px;margin:${-7 * scale}px 0 0 ${-7 * scale}px;border-radius:50%;
    border:3px solid #b3bcf6;background:rgba(179,188,246,.35);animation:__t_rip .6s ease-out forwards}
  @keyframes __t_rip{to{transform:scale(4.2);opacity:0}}
  #__t_cap{position:fixed;left:50%;bottom:34px;z-index:2147483645;pointer-events:none;display:flex;align-items:center;gap:14px;
    width:max-content;max-width:1040px;padding:14px 24px 14px 14px;background:rgba(17,19,23,.94);border:1px solid #3d4450;border-radius:3px;
    box-shadow:0 10px 36px rgba(0,0,0,.5);color:#eceef2;font:600 22px/1.25 var(--font-chivo),system-ui,sans-serif;
    opacity:0;transform:translate(-50%,12px);transition:opacity .3s ease,transform .3s ease}
  #__t_cap.on{opacity:1;transform:translate(-50%,0)}
  #__t_cap[data-pos=top]{top:76px;bottom:auto}
  #__t_cap[data-pos=left]{left:40px;transform:translate(0,12px)}
  #__t_cap[data-pos=left].on{transform:none}
  #__t_cap[data-pos=right]{left:auto;right:40px;transform:translate(0,12px)}
  #__t_cap[data-pos=right].on{transform:none}
  #__t_cap b{flex:none;display:grid;place-items:center;min-width:34px;height:34px;padding:0 6px;background:#35c46b;color:#0a0f0d;
    font:900 19px/1 var(--font-chivo),system-ui,sans-serif;border-radius:2px}
  #__t_ring{position:fixed;z-index:2147483644;pointer-events:none;border:3px solid #b3bcf6;border-radius:4px;
    box-shadow:0 0 0 6px rgba(179,188,246,.18),0 0 28px rgba(179,188,246,.35);animation:__t_pulse 1.4s ease-in-out infinite}
  @keyframes __t_pulse{50%{box-shadow:0 0 0 12px rgba(179,188,246,.08),0 0 40px rgba(179,188,246,.5)}}
  #__t_card{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;
    background:#111317;color:#eceef2;font-family:var(--font-chivo),system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .45s ease}
  #__t_card.on{opacity:1}
  #__t_card .brand{display:flex;align-items:center;gap:14px;margin-bottom:46px;font-weight:900;font-size:34px;letter-spacing:-.03em}
  #__t_card .brand svg{height:40px}
  #__t_card h1{margin:0;max-width:1000px;font-weight:900;font-size:78px;line-height:.98;letter-spacing:-.035em}
  #__t_card p{margin:26px 0 0;max-width:760px;font-size:26px;line-height:1.35;color:#a6acb8;font-weight:500}
  #__t_card .bar{margin-top:44px;width:84px;height:5px;background:#35c46b}
  #__t_card.up h1,#__t_card.up p,#__t_card.up .bar,#__t_card.up .brand{animation:__t_up .7s cubic-bezier(.2,.7,.2,1) both}
  #__t_card.up p{animation-delay:.12s}#__t_card.up .bar{animation-delay:.2s}
  @keyframes __t_up{from{opacity:0;transform:translateY(18px)}}
  `;
  const mark = `<svg viewBox="0 0 80 100" aria-hidden="true"><g fill="#eceef2"><rect width="12" height="100"/><rect x="68" width="12" height="100"/><rect y="60" width="80" height="9"/></g><rect x="12" y="69" width="56" height="31" fill="#35c46b"/></svg>`;
  const build = () => {
    if (document.getElementById("__t_cursor")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.append(style);
    const cur = document.createElement("div");
    cur.id = "__t_cursor";
    cur.innerHTML = `<svg viewBox="0 0 24 24" width="${30 * scale}" height="${30 * scale}"><path d="M3 2l7.2 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#111317" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    const cap = document.createElement("div");
    cap.id = "__t_cap";
    cap.dataset.pos = sessionStorage.getItem("__t_where") || "bottom";
    document.documentElement.append(cur, cap);
    const at = (x, y) => (cur.style.transform = `translate(${x - 4 * scale}px,${y - 3 * scale}px)`);
    const saved = sessionStorage.getItem("__t_pos");
    if (saved) {
      const [x, y] = JSON.parse(saved);
      at(x, y);
    }
    addEventListener("mousemove", (e) => {
      at(e.clientX, e.clientY);
      sessionStorage.setItem("__t_pos", JSON.stringify([e.clientX, e.clientY]));
    }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.className = "__t_ripple";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.documentElement.append(r);
      setTimeout(() => r.remove(), 700);
    }, true);
    // A caption carried across a page change, so it does not blink off.
    const kept = sessionStorage.getItem("__t_cap");
    if (kept) {
      const [n, text] = JSON.parse(kept);
      cap.innerHTML = (n ? `<b>${n}</b>` : "") + `<span></span>`;
      cap.querySelector("span").textContent = text;
      cap.classList.add("on");
    }
    window.__t = {
      say(n, text) {
        if (!text) {
          cap.classList.remove("on");
          sessionStorage.removeItem("__t_cap");
          return;
        }
        cap.classList.remove("on");
        setTimeout(() => {
          cap.innerHTML = (n ? `<b>${n}</b>` : "") + `<span></span>`;
          cap.querySelector("span").textContent = text;
          cap.classList.add("on");
        }, cap.innerHTML ? 160 : 0);
        sessionStorage.setItem("__t_cap", JSON.stringify([n, text]));
      },
      where(pos) {
        cap.dataset.pos = pos;
        sessionStorage.setItem("__t_where", pos);
      },
      ring(x, y, w, h) {
        let r = document.getElementById("__t_ring");
        if (!r) {
          r = document.createElement("div");
          r.id = "__t_ring";
          document.documentElement.append(r);
        }
        Object.assign(r.style, { left: x - 7 + "px", top: y - 7 + "px", width: w + 14 + "px", height: h + 14 + "px" });
      },
      unring() {
        document.getElementById("__t_ring")?.remove();
      },
      card(title, sub, { end = false } = {}) {
        document.getElementById("__t_card")?.remove();
        const c = document.createElement("div");
        c.id = "__t_card";
        const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        c.innerHTML = `<div class="brand">${mark}<span>Ardawn</span></div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}<div class="bar"></div>`;
        document.documentElement.append(c);
        void c.offsetWidth;
        c.classList.add("on", "up");
        return end;
      },
      uncard() {
        const c = document.getElementById("__t_card");
        if (!c) return;
        c.classList.remove("on");
        setTimeout(() => c.remove(), 500);
      },
    };
  };
  if (document.documentElement) build();
  else document.addEventListener("DOMContentLoaded", build);
  document.addEventListener("DOMContentLoaded", build);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A pause inside the steps, shortened or stretched by the video's pace. */
let pace = 1;
const nap = (ms) => sleep(ms * pace);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Record one video.
 *
 *   await film({ slug, title, subtitle, auth, start, steps: async (t) => { ... } })
 *
 * `t` is the set of things a script may do: say, goto, click, type, press,
 * hold, ring, and `page` for anything else.
 */
export async function film({ slug, title, subtitle, auth = true, start = "/", where = "bottom", width = 1280, pace: p = 1, members = false, before, steps, outro = "Match video review for GAA clubs" }) {
  pace = p;
  await before?.();
  const frameDir = join(WORK, "frames", slug);
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
  const OUT = members ? MEMBERS_OUT : PUBLIC_OUT;
  mkdirSync(OUT, { recursive: true });

  const W = width;
  const H = Math.round((width * 9) / 16);
  const SCALE = OUT_W / W;
  const browser = await chromium.launch({ args: ["--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
    colorScheme: "dark",
    locale: "en-IE",
    timezoneId: "Europe/Dublin",
  });
  if (auth) await ctx.addCookies([{ name: "fisean_session", value: readFileSync(join(WORK, "session.txt"), "utf8"), url: BASE }]);
  await ctx.addInitScript(overlay, SCALE);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15_000);

  // Frames, kept on disk as they arrive.
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  let recording = false;
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    if (recording) {
      const file = join(frameDir, `${String(frames.length).padStart(6, "0")}.jpg`);
      writeFileSync(file, Buffer.from(data, "base64"));
      frames.push({ file, t: metadata.timestamp });
    }
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: OUT_W, maxHeight: OUT_H, everyNthFrame: 1 });

  await page.goto(BASE + start, { waitUntil: "load" });
  await sleep(900);
  // The page is loaded and the card goes over it before anything is kept, so
  // the video opens on the card and never on a half-drawn page.
  await page.evaluate(([a, b]) => window.__t.card(a, b), [title, subtitle ?? ""]);
  await sleep(700);
  recording = true;
  await sleep(2300);
  await page.evaluate(() => window.__t.uncard());
  await sleep(700);

  await page.evaluate((p) => window.__t.where(p), where);
  const mouse = { x: W / 2, y: H * 0.58 };
  await page.mouse.move(mouse.x, mouse.y);
  const t = {
    page,
    hold: nap,
    /** The caption along the bottom. Call with no text to clear it. */
    async say(text, n = null) {
      await page.evaluate(([a, b]) => window.__t.say(a, b), [n, text ?? ""]);
      await nap(text ? 450 : 200);
    },
    /** Where captions sit: bottom (default), top, left or right. Move them off whatever is being used. */
    async where(pos) {
      await page.evaluate((p) => window.__t.where(p), pos);
    },
    async goto(path) {
      await page.goto(BASE + path, { waitUntil: "load" });
      await nap(500);
    },
    /** Glide the cursor onto an element, at a pace a viewer can follow. */
    async glide(target, { dx = 0, dy = 0 } = {}) {
      const loc = typeof target === "string" ? page.locator(target).first() : target;
      await reveal(page, loc, H);
      const box = await loc.boundingBox();
      if (!box) throw new Error(`Cannot find ${target}`);
      const x = box.x + box.width / 2 + dx;
      const y = box.y + box.height / 2 + dy;
      await glideTo(page, mouse, x, y);
      return { x, y, box };
    },
    async click(target, opts) {
      const { x, y } = await this.glide(target, opts);
      await nap(180);
      await page.mouse.down();
      await nap(70);
      await page.mouse.up();
      await nap(350);
      return { x, y };
    },
    /** Click at a point on the page, used for pitch maps and boards. */
    async clickAt(x, y) {
      await glideTo(page, mouse, x, y);
      await nap(160);
      await page.mouse.down();
      await nap(60);
      await page.mouse.up();
      await nap(350);
    },
    async drag(from, to, ms = 700) {
      await glideTo(page, mouse, from.x, from.y);
      await nap(150);
      await page.mouse.down();
      await nap(120);
      await glideTo(page, mouse, to.x, to.y, ms);
      await nap(120);
      await page.mouse.up();
      await nap(400);
    },
    /** Click a field, then type into it at a human speed. */
    async type(target, text, { delay = 75, clear = false } = {}) {
      const loc = typeof target === "string" ? page.locator(target).first() : target;
      await this.click(loc);
      if (clear) await page.keyboard.press("Control+A");
      await loc.pressSequentially(text, { delay });
      // The stat sheet's number fields ignore real keystrokes under automation
      // (fill works), so build the value up a character at a time instead.
      if ((await loc.inputValue()) !== text) {
        await loc.fill("");
        for (let i = 1; i <= text.length; i++) {
          await loc.fill(text.slice(0, i));
          await nap(delay);
        }
      }
      await nap(300);
    },
    /** Scroll the page down by some pixels, smoothly. Negative goes up. */
    async scroll(px, ms = 1400) {
      await page.evaluate(async ([by, dur]) => {
        const from = scrollY;
        const start = performance.now();
        await new Promise((done) => {
          const tick = (now) => {
            const k = Math.min(1, (now - start) / dur);
            scrollTo(0, from + by * (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2));
            k < 1 ? requestAnimationFrame(tick) : done();
          };
          requestAnimationFrame(tick);
        });
      }, [px, ms]);
      await nap(300);
    },
    /** The biggest svg on the page: the pitch map or the drill board. */
    async pitch() {
      const handles = await page.locator("svg").elementHandles();
      let best = null;
      for (const h of handles) {
        const b = await h.boundingBox();
        if (b && (!best || b.width * b.height > best.width * best.height)) best = b;
      }
      return {
        box: best,
        /** A point on it, as a fraction across and down. */
        at: (fx, fy) => ({ x: best.x + best.width * fx, y: best.y + best.height * fy }),
      };
    },
    async press(key, wait = 350) {
      await page.keyboard.press(key);
      await nap(wait);
    },
    /** A pulsing ring round an element, until unring(). */
    async ring(target) {
      const loc = typeof target === "string" ? page.locator(target).first() : target;
      await reveal(page, loc, H);
      const b = await loc.boundingBox();
      await page.evaluate(([x, y, w, h]) => window.__t.ring(x, y, w, h), [b.x, b.y, b.width, b.height]);
      await nap(250);
    },
    async unring() {
      await page.evaluate(() => window.__t.unring());
      await nap(150);
    },
  };

  let failure = null;
  try {
    await steps(t);
  } catch (e) {
    failure = e;
    await page.screenshot({ path: join(WORK, `${slug}-failed.png`) }).catch(() => {});
  }
  if (!failure) {
    await t.say(null);
    await t.unring();
    await sleep(500);
    await page.evaluate(([a, b]) => window.__t.card(a, b), ["That is all there is to it", outro]);
    await sleep(2600);
  }
  recording = false;
  await cdp.send("Page.stopScreencast").catch(() => {});
  await browser.close();
  if (failure) throw failure;

  // Each frame lasts until the next one appeared; the last holds for a beat.
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? f.t + 0.4;
    lines.push(`file '${f.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  lines.push(`file '${frames.at(-1).file.replace(/\\/g, "/")}'`);
  const list = join(WORK, `${slug}.ffconcat`);
  writeFileSync(list, lines.join("\n"));

  const mp4 = join(OUT, `${slug}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-movflags", "+faststart", mp4,
  ]);
  const seconds = (frames.at(-1).t - frames[0].t + 0.4).toFixed(1);
  // The poster is the picture at about two fifths of the way through.
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", String(Math.max(3.5, seconds * 0.4)), "-i", mp4, "-frames:v", "1", "-q:v", "3", join(OUT, `${slug}.jpg`)]);
  rmSync(frameDir, { recursive: true, force: true });
  console.log(`${slug}: ${seconds}s, ${frames.length} frames -> ${mp4}`);
}

/** Scroll an element into the middle of the view, smoothly, if it is not comfortably in it. */
async function reveal(page, loc, H) {
  await loc.waitFor({ state: "attached" });
  const box = await loc.boundingBox();
  if (box && box.y > 64 && box.y + box.height < H - 8) return;
  // The browser's own smooth scroll, which also works for a panel that scrolls on its own.
  await loc.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  await nap(900);
}

/** Move the real mouse along an eased path, so the drawn cursor glides. */
async function glideTo(page, from, x, y, ms) {
  const dist = Math.hypot(x - from.x, y - from.y);
  const total = (ms ?? Math.min(900, Math.max(350, dist * 1.1))) * pace;
  const stepMs = 16;
  const n = Math.max(2, Math.round(total / stepMs));
  const x0 = from.x;
  const y0 = from.y;
  for (let i = 1; i <= n; i++) {
    const k = ease(i / n);
    await page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k);
    await sleep(stepMs);
  }
  from.x = x;
  from.y = y;
}
