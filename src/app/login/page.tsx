"use client";

import { use, useActionState } from "react";
import { signIn } from "@/lib/actions/auth";
import { Gate, GateLink } from "@/components/ui/Gate";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Carried through the form so the app lands back where it was opened.
  const { next } = use(searchParams);
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <Gate
      title="Sign in"
      intro="Match footage, clipped and tagged, with the stat sheet beside it. For one club, on one machine."
      footer={
        <>
          New to the panel? <GateLink href={next ? `/join?next=${encodeURIComponent(next)}` : "/join"}>Join with your team code</GateLink>
        </>
      }
    >
      <form action={action} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label htmlFor="username" className="label mb-1.5 block">
            Username
          </label>
          <input id="username" name="username" autoComplete="username" autoFocus className="field" />
        </div>

        <div>
          <label htmlFor="password" className="label mb-1.5 block">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="field"
          />
        </div>

        {state?.error && (
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </Gate>
  );
}
