/**
 * How the club's footage imports are getting on, for the squad page to poll
 * while something is on its way across.
 *
 *   GET /api/import  →  { imports: ImportView[] }
 *
 * Starting, retrying and removing an import are server actions in
 * src/lib/actions/imports.ts; this only reads.
 */
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { isCoach } from "@/lib/auth/guard";
import { importsForTeam } from "@/lib/queries/imports";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isCoach(user)) return NextResponse.json({ error: "Only coaches and admins can see this." }, { status: 403 });
  return NextResponse.json({ imports: await importsForTeam(user.teamId) });
}
