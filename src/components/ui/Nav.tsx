"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import type { SessionUser } from "@/lib/auth/session";

/**
 * The masthead.
 *
 * Reads as the top of a team sheet: the club it belongs to, where you are,
 * and who is signed in. The chalk line under the current section is the only
 * marker — nothing else in here is coloured, because colour in this app means
 * something happened on the field.
 */
export function Nav({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  const sections = [
    { href: "/", label: "Matches", match: (p: string) => p === "/" || p.startsWith("/matches") },
    { href: "/playlists", label: "Playlists", match: (p: string) => p.startsWith("/playlists") },
    ...(user.role === "admin"
      ? [{ href: "/admin", label: "Squad", match: (p: string) => p.startsWith("/admin") }]
      : []),
  ];

  return (
    <header
      className="no-print sticky top-0 z-30 border-b backdrop-blur"
      style={{
        borderColor: "var(--color-line)",
        background: "color-mix(in oklab, var(--color-stage) 90%, transparent)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-stretch gap-5 px-4">
        <Link href="/" className="flex items-center gap-3 py-3.5">
          <span className="wordmark text-[22px]">Físeán</span>
          <span
            aria-hidden
            className="h-4 w-px"
            style={{ background: "var(--color-line-strong)" }}
          />
          <span className="text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
            {user.teamName}
          </span>
        </Link>

        <nav className="flex items-stretch">
          {sections.map((s) => {
            const here = s.match(pathname);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={here ? "page" : undefined}
                className={`flex items-center px-3 text-[14px] transition-colors ${here ? "here" : ""}`}
                style={{ color: here ? "var(--color-ink)" : "var(--color-ink-dim)" }}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-3 py-3.5">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-[13px]">{user.displayName}</div>
            {user.role !== "player" && (
              <div className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                {user.role === "admin" ? "Team admin" : "Coach"}
              </div>
            )}
          </div>
          {user.jerseyNumber != null && <span className="jersey">{user.jerseyNumber}</span>}
          <form action={signOut}>
            <button
              type="submit"
              className="text-[13px] transition-colors hover:text-[var(--color-ink)]"
              style={{ color: "var(--color-ink-faint)" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
