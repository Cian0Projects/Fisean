import Link from "next/link";
import { PitchMap } from "@/components/pitch/PitchMap";
import { Mark } from "@/components/ui/Mark";

/**
 * The shell for the two screens you see before you are on a panel.
 *
 * Behind them is the goal end, drawn to the same metre-accurate proportions
 * the shot maps use and turned right down. It is the one screen in the app
 * with nothing else to look at, and it says what this is before a word is
 * read — a crop of a real pitch rather than a graphic of one.
 */
export function Gate({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center overflow-hidden px-6 py-12">
      <GoalEnd />

      <div className="relative mx-auto grid w-full max-w-4xl items-center gap-10 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-4">
            <Mark className="h-[clamp(2.75rem,9vw,4rem)]" />
            <h1 className="wordmark text-[clamp(3rem,10vw,4.5rem)] leading-none">Ardawn</h1>
          </div>
          <div
            className="mt-4 h-px w-24"
            style={{ background: "var(--color-line-strong)" }}
            aria-hidden
          />
          <p className="measure mt-4 text-[16px]" style={{ color: "var(--color-ink-dim)" }}>
            {intro}
          </p>
        </div>

        <div
          className="p-6"
          style={{
            background: "var(--color-stage)",
            borderTop: "3px solid var(--color-rule)",
            borderBottom: "1px solid var(--color-line)",
          }}
        >
          <h2 className="title mb-5 text-lg">{title}</h2>
          {children}
          <div className="mt-5 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            {footer}
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * The whole pitch, lying along the bottom of the screen where nothing has to
 * be read over it. Markings only, from the same geometry the shot maps use.
 */
function GoalEnd() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 opacity-[0.16]"
      style={{
        transform: "translateY(22%)",
        // Faded in from the top so the far end line does not read as a stray
        // rule drawn across the middle of the screen.
        maskImage: "linear-gradient(to bottom, transparent, black 30%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black 30%)",
      }}
    >
      <PitchMap marks={[]} decorative />
    </div>
  );
}

export function GateLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="underline underline-offset-4" style={{ color: "var(--color-ash)" }}>
      {children}
    </Link>
  );
}
