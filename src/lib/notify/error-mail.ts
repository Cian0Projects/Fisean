/**
 * Emailing the host when the server throws, called from onRequestError in
 * src/instrumentation.ts. The rules (what counts as the same error, how often
 * one may be sent, what is stripped) are in error-alerts.ts; this file holds
 * the one throttle for the process and does the sending.
 *
 * It must never throw: an error while reporting an error would be reported as
 * an error. Without ALERT_EMAIL it does nothing at all.
 */
import { sendMail } from "@/lib/mail";
import { serverErrorMail } from "@/lib/mail/templates";
import { buildAlert, createThrottle } from "./error-alerts";

const throttle = createThrottle();

export async function emailServerError(
  err: unknown,
  request: { path: string; method: string },
  context: { routePath: string },
): Promise<void> {
  try {
    const to = process.env.ALERT_EMAIL?.trim();
    if (!to) return;

    const now = Date.now();
    const alert = buildAlert({
      err,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      now,
    });
    if (!throttle.allow(alert.key, now)) return;

    await sendMail({ to, ...serverErrorMail(alert) });
  } catch (failed) {
    console.error("Could not email a server error:", failed instanceof Error ? failed.message : "unknown");
  }
}
