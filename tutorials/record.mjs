/**
 * Record the how-to videos into public/guides/.
 *
 *   node record.mjs                 every video
 *   node record.mjs make-a-drill    just that one
 *
 * Needs the app running against the throwaway database: see README.md.
 */
import { readdirSync } from "node:fs";
import { film } from "./lib.mjs";

const only = process.argv.slice(2);
const files = readdirSync(new URL("./videos/", import.meta.url)).filter((f) => f.endsWith(".mjs")).sort();

for (const f of files) {
  const { default: video } = await import(`./videos/${f}`);
  if (only.length && !only.includes(video.slug)) continue;
  await film(video);
}
