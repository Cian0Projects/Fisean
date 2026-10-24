"use server";

import { revalidatePath } from "next/cache";
import { approveClub, clubForReview, declineClub, validReview } from "@/lib/db/clubs";
import { sendMail } from "@/lib/mail";
import { clubApprovedMail, clubDeclinedMail } from "@/lib/mail/templates";
import { appUrl } from "@/lib/url";

/*
 * The host's answer on a waiting club. Not behind a sign-in: the host has
 * no account on any club. The signed link is the permission instead, and
 * both are checked again here rather than trusted from the page, because a
 * server action can be called with any arguments by anyone who finds it.
 */

export type ReviewState = { done?: "approved" | "declined"; error?: string } | undefined;

export async function answerClubReview(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  const clubId = String(form.get("club") ?? "");
  const signature = String(form.get("k") ?? "");
  const answer = form.get("answer");
  if (!validReview(clubId, signature)) return { error: "That link is not right. Use the one in the email." };

  // Read before deciding, so a declined club's admin can still be told.
  const club = await clubForReview(clubId);
  if (!club) return { error: "That club is no longer here." };
  if (club.approvedAt !== null) return { error: "That club was already let in." };
  const admin = club.admin;

  if (answer === "approve") {
    await approveClub(clubId);
    if (admin?.email) {
      const mail = clubApprovedMail({ name: admin.name, clubName: club.name, url: `${await appUrl()}/admin` });
      await sendMail({ to: admin.email, toName: admin.name, ...mail }).catch((err) =>
        console.error(`Approved ${club.name} but could not email ${admin.email}.`, err),
      );
    }
    revalidatePath(`/host/clubs/${clubId}`);
    return { done: "approved" };
  }

  if (answer === "decline") {
    await declineClub(clubId);
    if (admin?.email) {
      const mail = clubDeclinedMail({ name: admin.name, clubName: club.name });
      await sendMail({ to: admin.email, toName: admin.name, ...mail }).catch((err) =>
        console.error(`Declined ${club.name} but could not email ${admin.email}.`, err),
      );
    }
    return { done: "declined" };
  }

  return { error: "Choose approve or decline." };
}
