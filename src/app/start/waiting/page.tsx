import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser, waitingUser } from "@/lib/auth/session";
import { signOut } from "@/lib/actions/auth";
import { Gate } from "@/components/ui/Gate";

export const metadata: Metadata = { title: "Your club is being checked", robots: { index: false } };

/**
 * Where a new club's admin waits for the host's check. Every page sends
 * them here until it is done (the guards in src/lib/auth/guard.ts), so it
 * has to say plainly what is happening and when it will be over, or it
 * reads as something broken.
 */
export default async function WaitingPage() {
  const waiting = await waitingUser();
  if (!waiting) redirect((await currentUser()) ? "/admin" : "/login");

  const first = waiting.displayName.split(/\s+/)[0] || waiting.displayName;

  return (
    <Gate
      title="Your club is being checked"
      intro="Every new club on Ardawn is looked at by a person before it opens, so that each club is here once and is who it says it is."
      footer={
        <form action={signOut}>
          <button type="submit" className="underline underline-offset-2">
            Sign out
          </button>
        </form>
      }
    >
      <div className="space-y-4 text-[15px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
        <p>
          Thanks, {first}. {waiting.clubName} is set up and waiting for us to check it. We usually
          do that within a day.
        </p>
        <p>
          We will email {waiting.email ?? "you"} as soon as it is ready. Then sign in, get your
          team code for the panel, and drop in your first match.
        </p>
        <p>
          In a hurry, or think your club is already on Ardawn? Email{" "}
          <a href="mailto:hello@ardawnsport.ie" className="underline">
            hello@ardawnsport.ie
          </a>
          .
        </p>
      </div>
    </Gate>
  );
}
