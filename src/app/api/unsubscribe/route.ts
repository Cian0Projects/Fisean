/**
 * Turning share emails off, without signing in.
 *
 * Two callers: the button on /unsubscribe, and Gmail or Yahoo's own
 * "unsubscribe" button, which POSTs here directly (RFC 8058) because of the
 * List-Unsubscribe-Post header on every share email. Only a POST changes
 * anything, for the same reason the sign-in link needs a tap: mail scanners
 * open every link, and a GET that unsubscribed would unsubscribe everyone.
 */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { validUnsubscribe } from "@/lib/notify/unsubscribe";

export async function POST(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("u") ?? "";
  const signature = req.nextUrl.searchParams.get("s") ?? "";
  if (!validUnsubscribe(userId, signature)) {
    return new NextResponse("That link is not valid.", { status: 400 });
  }

  await db.update(users).set({ emailNotifications: false }).where(eq(users.id, userId));

  // A mail provider's one-click POST wants a plain success; a person wants a page.
  const body = await req.text();
  if (body.includes("List-Unsubscribe=One-Click")) return new NextResponse(null, { status: 200 });
  return NextResponse.redirect(new URL("/unsubscribe?done=1", req.url), 303);
}
