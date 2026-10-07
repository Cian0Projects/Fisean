"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import type { SessionUser } from "@/lib/auth/session";
import { Mark } from "@/components/ui/Mark";

/**
 * The masthead.
 *
 * Reads as the top of a match programme: the club it belongs to, where you
 * are, and who is signed in. The bar of spot ink under the current section is
 * the only marker — nothing else in here is coloured, because colour in this
 * app means something happened on the field.
 */
export function Nav({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  const sections = [
    { href: "/", label: "Matches", match: (p: string) => p === "/" || p.startsWith("/matches") },
    { href: "/playlists", label: "Playlists", match: (p: string) => p.startsWith("/playlists") },
    // The drill board is the coaches' planning, not something a player reviews.
    ...(user.role !== "player"
      ? [{ href: "/drills", label: "Drills", match: (p: string) => p.startsWith("/drills") }]
      : []),
    ...(user.role === "admin"
      ? [{ href: "/admin", label: "Squad", match: (p: string) => p.startsWith("/admin") }]
      : []),
  ];

  return (
    <header
      className="no-print sticky top-0 z-30 border-b"
      style={{ borderColor: "var(--color-line)", background: "var(--color-stage)" }}
    >
      <div className="sheet flex items-stretch gap-3 sm:gap-5">
        <Link href="/" className="flex items-center gap-3 py-3.5">
          <Mark className="h-[22px]" />
          <span className="wordmark -ml-0.5 hidden text-[22px] leading-none sm:inline">Ardawn</span>
          <span
            aria-hidden
            className="hidden h-4 w-px md:block"
            style={{ background: "var(--color-line-strong)" }}
          />
          <span className="hidden text-[13px] font-medium md:inline" style={{ color: "var(--color-ink-dim)" }}>
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
                className={`flex items-center px-2 text-[14px] font-semibold sm:px-3 transition-colors ${here ? "here" : ""}`}
                style={{ color: here ? "var(--color-ink)" : "var(--color-ink-dim)" }}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-3 py-3.5">
          {/* Only on a narrow screen: the phone layout is one tap away. */}
          <Link href="/m" className="whitespace-nowrap text-[13px] sm:hidden" style={{ color: "var(--color-ink-dim)" }}>
            Phone view
          </Link>
          <div className="hidden leading-tight sm:block">
            <div className="text-[13px] font-semibold">{user.displayName}</div>
            {user.role !== "player" && (
              <div className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                {user.role === "admin" ? "Team admin" : "Coach"}
              </div>
            )}
          </div>
          {/* The phone view has its own sign-out, and a narrow masthead needs the room. */}
          <form action={signOut} className="hidden sm:block">
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
