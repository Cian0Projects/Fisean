"use client";

import { useActionState } from "react";
import { answerClubReview } from "@/lib/actions/club-review";

/** Approve or decline. Declining deletes the club, so it is asked twice. */
export function ReviewForm({
  clubId,
  signature,
  clubName,
}: {
  clubId: string;
  signature: string;
  clubName: string;
}) {
  const [state, action, pending] = useActionState(answerClubReview, undefined);

  if (state?.done === "approved") {
    return <p className="text-[15px] font-semibold">{clubName} is in. We have emailed its admin to say so.</p>;
  }
  if (state?.done === "declined") {
    return <p className="text-[15px] font-semibold">{clubName} was declined and deleted. We have emailed its admin.</p>;
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="club" value={clubId} />
      <input type="hidden" name="k" value={signature} />
      {state?.error && (
        <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" name="answer" value="approve" disabled={pending} className="btn-primary flex-1">
          {pending ? "Saving…" : "Approve"}
        </button>
        <button
          type="submit"
          name="answer"
          value="decline"
          disabled={pending}
          onClick={(e) => {
            if (!confirm(`Decline ${clubName}? The club and its admin's account are deleted.`)) e.preventDefault();
          }}
          className="btn-outline flex-1"
        >
          Decline
        </button>
      </div>
    </form>
  );
}
