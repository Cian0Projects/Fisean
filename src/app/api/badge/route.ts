/**
 * The signed-in member's club badge.
 *
 * Only ever your own club's: the team comes from the session, never from the
 * URL, so one club cannot ask for another's. The `v` in the URL is the time
 * the badge last changed, which is what lets the browser keep it for a year
 * and still show a new badge the moment an admin uploads one.
 */
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";

export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });

  const [team] = await db
    .select({ badge: teams.badge })
    .from(teams)
    .where(eq(teams.id, user.teamId))
    .limit(1);
  if (!team?.badge) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(team.badge), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=31536000, immutable",
      // The bytes were checked as a PNG on the way in; never let a browser
      // second-guess that into something it would run.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
