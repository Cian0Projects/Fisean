"use client";

import { useActionState, useState } from "react";
import { startClub } from "@/lib/actions/auth";
import { Gate, GateLink } from "@/components/ui/Gate";
import { GAME_CODES, GAME_LABELS } from "@/lib/hurling/codes";
import { ORG_KINDS, orgTerms, type OrgKind } from "@/lib/hurling/org";

/**
 * Setting up a club or a county. This replaces a terminal command, so it is
 * aimed at the club secretary or the manager rather than whoever is good with
 * computers: five fields, then the code emailed to them.
 *
 * The first choice is whether this is a club or a county, and every word
 * below it follows that choice as it is made, so a county board never reads a
 * form written for someone else. The choice is stored on the club and the
 * workspace uses the same word afterwards (see src/lib/hurling/org.ts).
 *
 * Open to anyone, with no code to ask for first. What keeps it honest is a
 * person checking each new club or county before it opens, so the form says so
 * up front: the wait afterwards is expected, not a surprise.
 */
export function StartForm() {
  const [state, action, pending] = useActionState(startClub, undefined);
  const [kind, setKind] = useState<OrgKind>("club");
  const { noun, Noun, namePlaceholder } = orgTerms(kind);

  return (
    <Gate
      title={`Set up your ${noun}`}
      intro={`Make a space for your ${noun}, then drop in a match. You get a six-character code to send the panel, and that is all they need to watch it. We check every new ${noun} before it opens, usually within a day.`}
      footer={
        <>
          Your {noun} is already on Ardawn? <GateLink href="/join">Join with your team code</GateLink>
        </>
      }
    >
      <form action={action} className="space-y-4">
        <fieldset>
          <legend className="label mb-1.5 block">Setting up a</legend>
          <div className="grid grid-cols-2 gap-2">
            {ORG_KINDS.map((k) => (
              <label key={k} className="cursor-pointer">
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="peer sr-only"
                />
                <span
                  className="block border px-3 py-2.5 text-center text-[14px] font-semibold peer-checked:border-[var(--color-ink)] peer-checked:bg-[var(--color-ink)] peer-checked:text-[var(--color-stage)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
                  style={{ borderColor: "var(--color-line-strong)", borderRadius: 2 }}
                >
                  {orgTerms(k).Noun}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="teamName" className="label mb-1.5 block">
            {Noun}
          </label>
          <input
            id="teamName"
            name="teamName"
            autoFocus
            placeholder={namePlaceholder}
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
            Start with one team. You can add the {noun}&apos;s other teams, in any game, once you
            are in.
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
            We will send a code here to finish, and email you again when the {noun} is ready. You
            will be the {noun}&apos;s admin.
          </p>
        </div>

        {state?.error && (
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Sending…" : `Set up the ${noun}`}
        </button>
        {/* The data agreement says setting up a club is agreeing to it, so
            the place where that happens has to say so too. */}
        <p className="text-center text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Setting up the {noun} accepts the{" "}
          <a href="/privacy/agreement" target="_blank" className="underline">
            data agreement
          </a>{" "}
          for its footage and panel.
        </p>
      </form>
    </Gate>
  );
}
