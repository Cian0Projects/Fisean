"use client";

import { use, useActionState } from "react";
import { confirmLink } from "@/lib/actions/auth";
import { Gate, GateLink } from "@/components/ui/Gate";

/**
 * Where the emailed link lands. Opening it does nothing on its own; the
 * button does. Work and school mail systems open every link in a message to
 * scan it, and a link that signed you in on opening would be spent by the
 * scanner before you ever tapped it.
 */
export default function LinkPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; k?: string }>;
}) {
  const { r, k } = use(searchParams);
  const [state, action, pending] = useActionState(confirmLink, undefined);

  return (
    <Gate
      title="Nearly there"
      intro="One tap and you are in."
      footer={
        <>
          Link not working? <GateLink href="/login">Ask for a new code</GateLink>
        </>
      }
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="r" value={r ?? ""} />
        <input type="hidden" name="k" value={k ?? ""} />

        {state?.error && (
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} autoFocus className="btn-primary w-full">
          {pending ? "Signing in…" : "Continue to Ardawn"}
        </button>
      </form>
    </Gate>
  );
}
