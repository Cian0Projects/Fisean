"use client";

import { useActionState } from "react";
import { startClub } from "@/lib/actions/auth";
import { Gate, GateLink } from "@/components/ui/Gate";
import { GAME_CODES, GAME_LABELS } from "@/lib/hurling/codes";

/**
 * Setting up a club. This replaces a terminal command, so it is aimed at the
 * club secretary or the manager rather than whoever is good with computers:
 * four fields (five when the host asks for a sign-up code), then the code
 * emailed to them, and the next screen has the team code to send the panel
 * and a place to drop the first match.
 *
 * The sign-up code, when the host asks for one, usually arrives in the link
 * to this page (/start?code=…), and then the field is never shown. Someone
 * who found the page on their own is told how to get one before they are
 * asked for it, so the first thing they read is how to start, not a box
 * they cannot fill.
 */
export function StartForm({ needsCode, givenCode }: { needsCode: boolean; givenCode: string }) {
  const [state, action, pending] = useActionState(startClub, undefined);
  const askForCode = needsCode && !givenCode;

  return (
    <Gate
      title="Set up your club"
      intro="Make a space for your club, then drop in a match. You get a six-character code to send the panel, and that is all they need to watch it."
      footer={
        <>
          Your club is already on Ardawn? <GateLink href="/join">Join with your team code</GateLink>
        </>
      }
    >
      <form action={action} className="space-y-4">
        {needsCode && givenCode && <input type="hidden" name="signupCode" value={givenCode} />}
        {askForCode && (
          <div>
            <p className="mb-3 text-[14px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
              To get set up, email{" "}
              <a href="mailto:hello@ardawnsport.ie?subject=Setting%20up%20our%20club%20on%20Ardawn" className="underline">
                hello@ardawnsport.ie
              </a>{" "}
              and we&apos;ll send you a sign-up code quickly. If you have one already, put it here.
            </p>
            <label htmlFor="signupCode" className="label mb-1.5 block">
              Sign-up code
            </label>
            <input id="signupCode" name="signupCode" autoComplete="off" className="field" />
          </div>
        )}

        <div>
          <label htmlFor="teamName" className="label mb-1.5 block">
            Club
          </label>
          <input
            id="teamName"
            name="teamName"
            autoFocus={!askForCode}
            placeholder="St Brigid's GAA"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="code" className="label mb-1.5 block">
            Game
          </label>
          <select id="code" name="code" defaultValue="" className="field">
            <option value="" disabled>
              Choose the game your first team plays
            </option>
            {GAME_CODES.map((c) => (
              <option key={c} value={c}>
                {GAME_LABELS[c]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Start with one team. You can add the club&apos;s other teams, in any game, once you are in.
          </p>
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
            We will send a code here to finish. You will be the club&apos;s admin.
          </p>
        </div>

        {state?.error && (
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Sending…" : "Set up the club"}
        </button>
        {/* The data agreement says setting up a club is agreeing to it, so
            the place where that happens has to say so too. */}
        <p className="text-center text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Setting up the club accepts the{" "}
          <a href="/privacy/agreement" target="_blank" className="underline">
            data agreement
          </a>{" "}
          for its footage and panel.
        </p>
      </form>
    </Gate>
  );
}
