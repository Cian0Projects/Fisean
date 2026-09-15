"use client";

import Link from "next/link";

import { useActionState } from "react";
import { signIn } from "@/lib/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold" style={{ color: "var(--color-brand)" }}>
            Físeán
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--color-ink-dim)" }}>
            Hurling video review
          </p>
        </div>

        <form action={action} className="card space-y-4 p-6">
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
            <p className="text-[13px]" style={{ color: "var(--color-danger)" }}>
              {state.error}
            </p>
          )}

          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          New to the panel?{" "}
          <Link href="/join" style={{ color: "var(--color-brand)" }}>
            Join with your team code
          </Link>
        </p>
      </div>
    </main>
  );
}
