import { Gate, GateLink } from "@/components/ui/Gate";

/**
 * The page behind "Stop these emails". A button, not an automatic change on
 * opening; see src/app/api/unsubscribe/route.ts for why.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; s?: string; done?: string }>;
}) {
  const { u, s, done } = await searchParams;

  if (done) {
    return (
      <Gate
        title="Emails stopped"
        intro="You will not get emails about shares any more."
        footer={
          <>
            Changed your mind? Turn them back on from <GateLink href="/account">your account</GateLink>.
          </>
        }
      >
        <p className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
          Sign-in codes still come by email, because that is how you sign in.
        </p>
      </Gate>
    );
  }

  return (
    <Gate
      title="Stop share emails"
      intro="No more emails when footage, playlists or clips are shared with you."
      footer={
        <>
          Or choose from <GateLink href="/account">your account</GateLink>.
        </>
      }
    >
      <form
        method="post"
        action={`/api/unsubscribe?u=${encodeURIComponent(u ?? "")}&s=${encodeURIComponent(s ?? "")}`}
      >
        <button type="submit" className="btn-primary w-full">
          Stop these emails
        </button>
      </form>
    </Gate>
  );
}
