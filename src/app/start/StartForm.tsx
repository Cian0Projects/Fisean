"use client";

import { useActionState } from "react";
import { startClub } from "@/lib/actions/auth";
import { Gate, GateLink } from "@/components/ui/Gate";

/**
 * Setting up a club. This replaces a terminal command, so it is aimed at the
 * club secretary or the manager rather than whoever is good with computers:
 * four fields — five when the host asks for a sign-up code — and the next
 * screen has the code to send the panel and a place to drop the first match.
 */
export function StartForm({ needsCode }: { needsCode: boolean }) {
  const [state, action, pending] = useActionState(startClub, undefined);

  return (
    <Gate
      title="Set up your club"
      intro="Make a space for your team, then drop in a match. You get a six-character code to send the panel, and that is all they need to watch it."
      footer={
        <>
          Your club is already on Ardawn? <GateLink href="/join">Join with your team code</GateLink>
        </>
      }
    >
      <form action={action} className="space-y-4">
        {needsCode && (
          <div>
            <label htmlFor="signupCode" className="label mb-1.5 block">
              Sign-up code
            </label>
            <input id="signupCode" name="signupCode" autoFocus autoComplete="off" className="field" />
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              It came with the link to this page.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="teamName" className="label mb-1.5 block">
            Club or team
          </label>
          <input
            id="teamName"
            name="teamName"
            autoFocus={!needsCode}
            placeholder="Ballygunner senior hurlers"
            className="field"
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
            At least 8 characters. You will be the club&apos;s admin.
          </p>
        </div>

        {state?.error && (
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Setting up…" : "Set up the club"}
        </button>
      </form>
    </Gate>
  );
}
