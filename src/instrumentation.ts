/**
 * Runs once as the server starts. Footage being brought across from another
 * app carries on after a restart or a deploy: the parts already stored are
 * kept, and only the rest is fetched (src/lib/media/importer.ts). And the
 * timer that emails shares starts ticking (src/lib/notify/sender.ts).
 *
 * Built-in tags added since the database was made (the football ones, say)
 * are written in too, so a club that signed up before them gets them on the
 * next deploy rather than only a club that signs up after. Matches made
 * before oppositions existed are put on one the same way.
 *
 * onRequestError emails the host when a request throws, if ALERT_EMAIL is set
 * (src/lib/notify/error-mail.ts holds the throttling and the sending).
 */
import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { seedTaxonomy } = await import("./lib/db/clubs");
  void seedTaxonomy().catch((err) => console.error("Could not add the built-in tags:", err));
  const { linkOppositions } = await import("./lib/db/oppositions");
  void linkOppositions().catch((err) => console.error("Could not link matches to their opposition:", err));
  const { resumeImports } = await import("./lib/media/importer");
  // Not awaited: the server should not wait on four gigabytes to start.
  void resumeImports().catch((err) => console.error("Could not resume footage imports:", err));
  const { startDigestTimer } = await import("./lib/notify/sender");
  startDigestTimer();
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // The mailer reads the filesystem, so the Edge runtime has nothing to send with.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { emailServerError } = await import("./lib/notify/error-mail");
  await emailServerError(err, request, context);
};
