"use client";

import { use, useActionState } from "react";
import { requestSignIn } from "@/lib/actions/auth";
import { Gate, GateLink } from "@/components/ui/Gate";

/**
 * Signing in is one box: your email. A code comes back, and that is the
 * whole of it. No password to set, so none to forget by the next match.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Carried through the form so the app lands back where it was opened.
  const { next } = use(searchParams);
  const [state, action, pending] = useActionState(requestSignIn, undefined);

  return (
    <Gate
      title="Sign in"
      intro="Match footage, clipped and tagged, with the stat sheet beside it. Private to your club."
      footer={
        <>
          Setting up a new club? <GateLink href="/start">Start here</GateLink>
        </>
      }
    >
      <form action={action} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
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
            autoFocus
            className="field"
          />
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            We will email you a code. No password needed.
          </p>
        </div>

        {state?.error && (
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Sending…" : "Email me a code"}
        </button>
      </form>

      {/* A code only goes to an existing account, so someone who has never
          joined needs to be pointed at the way in before they type and wait. */}
      <div
        className="mt-6 space-y-3 rounded-lg border p-4"
        style={{ borderColor: "var(--color-line)" }}
      >
        <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          Don&apos;t have an account yet? An email code only works once you have joined your club&apos;s panel.
        </p>
        <a
          href={next ? `/join?next=${encodeURIComponent(next)}` : "/join"}
          className="btn-outline w-full text-center"
        >
          Join with your team code
        </a>
      </div>
    </Gate>
  );
}
