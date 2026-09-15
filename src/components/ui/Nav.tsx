import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import type { SessionUser } from "@/lib/auth/session";

export function Nav({ user }: { user: SessionUser }) {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur"
      style={{
        borderColor: "var(--color-line)",
        background: "color-mix(in oklab, var(--color-stage) 88%, transparent)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold" style={{ color: "var(--color-brand)" }}>
          Físeán
        </Link>
        <span className="text-sm" style={{ color: "var(--color-ink-faint)" }}>
          {user.teamName}
        </span>

        <nav className="ml-4 flex items-center gap-1 text-sm">
          <Link href="/" className="btn-ghost px-2.5 py-1.5">
            Matches
          </Link>
          <Link href="/playlists" className="btn-ghost px-2.5 py-1.5">
            Playlists
          </Link>
          {user.role === "admin" && (
            <Link href="/admin" className="btn-ghost px-2.5 py-1.5">
              Admin
            </Link>
          )}
        </nav>

        <div className="flex-1" />

        <span className="hidden text-[13px] sm:inline" style={{ color: "var(--color-ink-dim)" }}>
          {user.displayName}
          {user.role !== "player" && (
            <span
              className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase"
              style={{ background: "var(--color-surface-3)", color: "var(--color-ink-faint)" }}
            >
              {user.role}
            </span>
          )}
        </span>

        <form action={signOut}>
          <button type="submit" className="btn-ghost text-[13px]">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
