"use client";

import { use, useActionState } from "react";
import { joinTeam } from "@/lib/actions/auth";
import { Gate, GateLink } from "@/components/ui/Gate";

/**
 * Joining has to work on a phone, standing in a dressing room, in under a
 * minute. The team code, a name and an email, then the code that comes back
 * to that email. No password, no invitation to chase, nothing for the
 * manager to approve afterwards.
 */
export default function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Carried through the form so the app lands back where it was opened.
  const { next } = use(searchParams);
  const [state, action, pending] = useActionState(joinTeam, undefined);

  return (
    <Gate
      title="Join your panel"
      intro="Your manager has a six-character code. Add your name and email, and we will send you a code to finish."
      footer={
        <>
          Already set up? <GateLink href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Sign in</GateLink>
        </>
      }
    >
      <form action={action} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label htmlFor="joinCode" className="label mb-1.5 block">
            Team code
          </label>
          <input
            id="joinCode"
            name="joinCode"
            autoFocus
            autoCapitalize="characters"
            placeholder="K7RMQ4"
            className="field tabular text-xl tracking-[0.3em] uppercase"
            style={{ color: "var(--color-ash)" }}
          />
        </div>

        <div>
          <label htmlFor="displayName" className="label mb-1.5 block">
            Your name
          </label>
          <input id="displayName" name="displayName" autoComplete="name" className="field" />
        </div>

        <div>
          <label htmlFor="email" className="label mb-1.5 block">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            className="field"
          />
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            You sign in with a code sent here, so there is no password to remember.
          </p>
        </div>

        {state?.error && (
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Sending…" : "Join the panel"}
        </button>
      </form>
    </Gate>
  );
}
