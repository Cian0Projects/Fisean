"use client";

import { use, useActionState } from "react";
import { joinTeam } from "@/lib/actions/auth";
import { Gate, GateLink } from "@/components/ui/Gate";

/**
 * Joining has to work on a phone, standing in a dressing room, in under a
 * minute. One code, a name, a username and a password — no email to verify,
 * no invitation to chase, nothing for the manager to approve afterwards.
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
      intro="Your manager has a six-character code. That is the whole sign-up — no email to verify, nothing to approve."
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
          <label htmlFor="username" className="label mb-1.5 block">
            Username
          </label>
          <input id="username" name="username" autoComplete="username" className="field" />
        </div>

        <div>
          <label htmlFor="password" className="label mb-1.5 block">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            className="field"
          />
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            At least 8 characters.
          </p>
        </div>

        {state?.error && (
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Joining…" : "Join the panel"}
        </button>
      </form>
    </Gate>
  );
}
