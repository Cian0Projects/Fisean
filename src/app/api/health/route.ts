/**
 * For an uptime monitor (UptimeRobot or similar) to call every few minutes.
 *
 * The home page would answer even with the database gone, because it is
 * mostly static, so this asks the database a question too. It says nothing
 * about any club, and needs no session, because the monitor has none.
 */
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export async function GET() {
  try {
    db.get(sql`select 1`);
    return new NextResponse("ok", { headers: { "cache-control": "no-store" } });
  } catch {
    return new NextResponse("database unavailable", { status: 503, headers: { "cache-control": "no-store" } });
  }
}
