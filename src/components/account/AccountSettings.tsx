"use client";

import { useActionState, useState, useTransition } from "react";
import { requestEmailChange, setEmailNotifications } from "@/lib/actions/account";

/**
 * Two things and no more: the email you sign in with, and whether shares are
 * emailed to you. Changing the email sends a code to the new one first, so a
 * typo cannot lock you out.
 */
export function AccountSettings({
  email,
  notifications,
  justChanged,
}: {
  email: string | null;
  notifications: boolean;
  justChanged: boolean;
}) {
  const [state, action, pending] = useActionState(requestEmailChange, undefined);
  const [on, setOn] = useState(notifications);
  const [saving, startTransition] = useTransition();

  function toggle(next: boolean) {
    setOn(next);
    startTransition(async () => {
      try {
        await setEmailNotifications(next);
      } catch {
        setOn(!next);
      }
    });
  }

  return (
    <div className="measure mt-8 space-y-10">
      <section>
        <h2 className="title text-lg">Email</h2>
        <p className="mt-1 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
          {email ? (
            <>
              You sign in with <strong style={{ color: "var(--color-ink)" }}>{email}</strong>.
            </>
          ) : (
            "You have no email yet. Add one now, or you will not be able to sign in once this session ends."
          )}
        </p>
        {justChanged && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--color-ink)" }}>
            Done. That is your email from now on.
          </p>
        )}
        <form action={action} className="mt-4 flex flex-wrap items-start gap-3">
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder={email ? "New email" : "Your email"}
            aria-label={email ? "New email" : "Your email"}
            className="field max-w-xs flex-1"
          />
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Sending…" : email ? "Change" : "Add"}
          </button>
        </form>
        {state?.error && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {state.error}
          </p>
        )}
      </section>

      <section>
        <h2 className="title text-lg">Emails about shares</h2>
        <label className="mt-3 flex items-start gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={on}
            disabled={saving}
            onChange={(e) => toggle(e.target.checked)}
            className="mt-1"
          />
          <span style={{ color: "var(--color-ink-dim)" }}>
            Email me when a coach assigns me a playlist, new match footage is up, the coaches publish a playlist,
            or I am in a new clip. Several at once come as one email.
          </span>
        </label>
      </section>
    </div>
  );
}
