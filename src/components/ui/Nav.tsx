"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import type { SessionUser } from "@/lib/auth/session";
import { Mark } from "@/components/ui/Mark";
import { ClubBadge } from "@/components/ui/ClubBadge";
import { InstallHint } from "@/components/ui/InstallHint";

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

  const coach = user.role !== "player";
  // A coach's stat pages are under a match, but they belong to Stats: that
  // is the way the coach came in. A player has no Stats section, so a match's
  // stat sheet stays under Matches for them.
  const isStatsPage = (p: string) => p.startsWith("/stats") || /^\/matches\/[^/]+\/stats/.test(p);

  const sections = [
    {
      href: "/",
      label: "Matches",
      match: (p: string) => p === "/" || (p.startsWith("/matches") && !(coach && isStatsPage(p))),
    },
    // Logging is the coaches' job, and it has to be one tap away on match day.
    ...(coach ? [{ href: "/stats", label: "Stats", match: isStatsPage }] : []),
    { href: "/playlists", label: "Playlists", match: (p: string) => p.startsWith("/playlists") },
    // The drill board is the coaches' planning, not something a player reviews.
    ...(user.role !== "player"
      ? [{ href: "/drills", label: "Drills", match: (p: string) => p.startsWith("/drills") }]
      : []),
    // Coaches upload the footage, so they need the page; what is only for the
    // admin (the panel, roles, badge, team code, deleting) is hidden inside it.
    ...(user.role !== "player"
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
          <span className="hidden items-center gap-2 md:flex">
            <ClubBadge version={user.badgeVersion} className="h-6 w-6" />
            <span className="text-[13px] font-medium" style={{ color: "var(--color-ink-dim)" }}>
              {user.teamName}
            </span>
          </span>
        </Link>

        {/* On a phone the sections can outrun the width; they scroll sideways
            rather than squeezing into one another. */}
        <nav className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]">
          {sections.map((s) => {
            const here = s.match(pathname);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={here ? "page" : undefined}
                className={`flex shrink-0 items-center whitespace-nowrap px-2 text-[14px] font-semibold sm:px-3 transition-colors ${here ? "here" : ""}`}
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
          {/* The name opens your account: your email and what gets emailed to you. */}
          <Link href="/account" className="hidden leading-tight sm:block" title="Your account">
            <div className="text-[13px] font-semibold">{user.displayName}</div>
            {user.role !== "player" && (
              <div className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                {user.role === "admin" ? "Club admin" : "Coach"}
              </div>
            )}
          </Link>
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
      {/* An iPad gets the desktop layout, so the masthead is where it reaches them. */}
      <InstallHint />
    </header>
  );
}
