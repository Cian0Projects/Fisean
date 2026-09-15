"use client";

import Link from "next/link";

import { useActionState } from "react";
import { joinTeam } from "@/lib/actions/auth";

/**
 * Joining has to work on a phone, standing in a dressing room, in under a
 * minute. One code, a name, a username and a password — no email to verify,
 * no invitation to chase, nothing for the manager to approve afterwards.
 */
export default function JoinPage() {
  const [state, action, pending] = useActionState(joinTeam, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold" style={{ color: "var(--color-brand)" }}>
            Físeán
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--color-ink-dim)" }}>
            Join your panel
          </p>
        </div>

        <form action={action} className="card space-y-4 p-6">
          <div>
            <label htmlFor="joinCode" className="label mb-1.5 block">
              Team code
            </label>
            <input
              id="joinCode"
              name="joinCode"
              autoFocus
              autoCapitalize="characters"
              placeholder="e.g. K7RMQ4"
              className="field tabular text-lg tracking-[0.25em] uppercase"
            />
          </div>

          <div>
            <label htmlFor="displayName" className="label mb-1.5 block">
              Your name
            </label>
            <input id="displayName" name="displayName" autoComplete="name" className="field" />
          </div>

          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <div>
              <label htmlFor="username" className="label mb-1.5 block">
                Username
              </label>
              <input id="username" name="username" autoComplete="username" className="field" />
            </div>
            <div>
              <label htmlFor="jerseyNumber" className="label mb-1.5 block">
                Jersey
              </label>
              <input
                id="jerseyNumber"
                name="jerseyNumber"
                type="number"
                min={1}
                max={40}
                inputMode="numeric"
                className="field tabular"
              />
            </div>
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
            <p className="mt-1 text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
              At least 8 characters.
            </p>
          </div>

          {state?.error && (
            <p className="text-[13px]" style={{ color: "var(--color-danger)" }}>
              {state.error}
            </p>
          )}

          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Joining…" : "Join panel"}
          </button>
        </form>

        <p className="mt-5 text-center text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          Already set up?{" "}
          <Link href="/login" style={{ color: "var(--color-brand)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
