/**
 * The site's own address, for links that leave the site: the ones in emails.
 *
 * In production this must come from APP_URL and never from the request. A
 * link built from the Host header lets anyone ask for a sign-in email to a
 * player's address with Host set to their own domain; the player clicks, and
 * the link key lands on the attacker's server. In development, where nobody
 * is attacking a laptop and the address is often a LAN one, the request's own
 * host is a convenience worth having.
 */
import { headers } from "next/headers";

export async function appUrl(): Promise<string> {
  const set = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (set) return set;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL must be set, e.g. https://ardawnsport.ie, so emailed links point at the real site.");
  }
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  } catch {
    // Outside a request, such as the notification timer.
  }
  return "http://localhost:3000";
}
