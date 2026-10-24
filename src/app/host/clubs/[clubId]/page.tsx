import type { Metadata } from "next";
import { clubForReview, validReview } from "@/lib/db/clubs";
import { GAME_LABELS } from "@/lib/hurling/codes";
import { Gate } from "@/components/ui/Gate";
import { ReviewForm } from "./ReviewForm";

export const metadata: Metadata = { title: "Check a new club", robots: { index: false } };

/**
 * The host's check on a new club, opened from the email sent when it was
 * set up. No sign-in: the link's signature is the permission, and it opens
 * this one club only. Opening it changes nothing; the buttons do, so a mail
 * scanner following the link cannot approve a club by accident.
 */
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { clubId } = await params;
  const { k = "" } = await searchParams;

  if (!validReview(clubId, k)) {
    return (
      <Gate title="That link is not right" intro="Use the link in the email about the club." footer={null}>
        <p className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
          Or run <code>npm run pending-clubs</code> on the server for a fresh one.
        </p>
      </Gate>
    );
  }

  const club = await clubForReview(clubId);
  if (!club) {
    return (
      <Gate title="Nothing to check" intro="That club is no longer here, most likely because it was declined." footer={null}>
        <p className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
          There is nothing more to do.
        </p>
      </Gate>
    );
  }

  const facts: [string, string][] = [
    ["Club", club.name],
    ["First team plays", GAME_LABELS[club.game]],
    ["Set up by", club.admin ? `${club.admin.name}, ${club.admin.email ?? "no email"}` : "nobody"],
    ["Set up on", new Date(club.createdAt).toLocaleString("en-IE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Dublin" })],
  ];

  return (
    <Gate
      title={club.approvedAt ? "Already let in" : "Check a new club"}
      intro="Before a club opens, make sure it is real and is not on Ardawn already. Their email is proven, and an email can only be on one club, so the question is the club, not the person."
      footer="Approving emails them that the club is ready. Declining deletes the club and their account, and emails them to get in touch."
    >
      <dl className="space-y-2 text-[15px]">
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt className="caption">{term}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <p className="caption">Already on Ardawn with a similar name</p>
        {club.similar.length ? (
          <ul className="mt-1 list-disc pl-5 text-[15px] font-semibold">
            {club.similar.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px]">None</p>
        )}
      </div>

      <div className="mt-6">
        {club.approvedAt ? (
          <p className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            This club was let in on{" "}
            {new Date(club.approvedAt).toLocaleDateString("en-IE", { dateStyle: "long", timeZone: "Europe/Dublin" })}. Nothing more to do.
          </p>
        ) : (
          <ReviewForm clubId={club.id} signature={k} clubName={club.name} />
        )}
      </div>
    </Gate>
  );
}
