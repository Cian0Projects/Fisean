"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireUserOrThrow } from "@/lib/auth/guard";
import { looksLikeEmail, normaliseEmail } from "@/lib/auth/email-code";
import { issueSignIn } from "@/lib/auth/email-sign-in";
import type { AuthState } from "./auth";

/**
 * Change your own email. The new address gets a code like any sign-in, and
 * only when it comes back is the change made: an email you cannot read is
 * one you could never sign in with again.
 */
export async function requestEmailChange(_prev: AuthState, form: FormData): Promise<AuthState> {
  const user = await requireUserOrThrow();
  const email = normaliseEmail(String(form.get("email") ?? ""));
  if (!looksLikeEmail(email)) return { error: "Enter an email address." };
  if (email === user.email) return { error: "That is already your email." };

  const issued = await issueSignIn({
    email,
    purpose: "change-email",
    payload: { userId: user.id },
    send: true,
  });
  if ("error" in issued) return issued;
  redirect(`/login/code?r=${issued.requestId}`);
}

export async function setEmailNotifications(on: boolean): Promise<{ on: boolean }> {
  const user = await requireUserOrThrow();
  await db.update(users).set({ emailNotifications: on }).where(eq(users.id, user.id));
  revalidatePath("/account");
  return { on };
}
