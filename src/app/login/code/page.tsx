"use client";

import { use, useActionState } from "react";
import { confirmCode } from "@/lib/actions/auth";
import { Gate, GateLink } from "@/components/ui/Gate";

/**
 * Where every emailed code is typed: signing in, joining, setting up a club,
 * changing your email. It says the same thing whether or not the address had
 * an account, so this page cannot be used to find out who is on a panel.
 */
export default function CodePage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const { r } = use(searchParams);
  const [state, action, pending] = useActionState(confirmCode, undefined);

  return (
    <Gate
      title="Check your email"
      intro="If that address is on Ardawn, a six-digit code is on its way. It can take a minute, and it is worth checking spam."
      footer={
        <>
          Nothing came? <GateLink href="/login">Ask for a new code</GateLink>
        </>
      }
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="r" value={r ?? ""} />
        <div>
          <label htmlFor="code" className="label mb-1.5 block">
            Code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            // Lets iOS and Android offer the code from the email as you type.
            autoComplete="one-time-code"
            autoFocus
            maxLength={9}
            placeholder="482 913"
            className="field tabular text-xl tracking-[0.3em]"
            style={{ color: "var(--color-ash)" }}
          />
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Or tap the button in the email, on this device.
          </p>
        </div>

        {state?.error && (
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Checking…" : "Continue"}
        </button>
      </form>
    </Gate>
  );
}
