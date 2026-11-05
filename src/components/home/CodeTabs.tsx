import Link from "next/link";
import { CODE_PAGES } from "@/lib/code-pages";
import type { GameCode } from "@/lib/hurling/codes";

/**
 * The strip under the masthead on each code's page, never on the home page
 * itself (which lists the codes further down): Home and the four codes, side
 * by side, so a visitor moves between them in one click instead of going back
 * to the home page and in again.
 *
 * Plain links, so every page is reachable from every other with no script.
 * The page being read is marked and not linked. It scrolls sideways on a
 * narrow phone rather than wrapping, so the row stays one line.
 */
export function CodeTabs({ current }: { current?: GameCode }) {
  const items: { key: string; href: string; label: string; here: boolean }[] = [
    { key: "home", href: "/", label: "Home", here: current === undefined },
    ...CODE_PAGES.map((p) => ({ key: p.code, href: p.path, label: p.label, here: p.code === current })),
  ];
  return (
    <nav className="border-t border-line/60" aria-label="Home and each code">
      <ul className="sheet flex gap-x-6 overflow-x-auto whitespace-nowrap py-2.5 text-[14px]">
        {items.map((item) => (
          <li key={item.key}>
            {item.here ? (
              <span
                className="border-b-2 border-ink pb-1 font-semibold text-ink"
                aria-current="page"
              >
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="border-b-2 border-transparent pb-1 font-semibold text-ink-dim hover:text-ink">
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
