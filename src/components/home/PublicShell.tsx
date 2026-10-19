import Link from "next/link";
import { Mark } from "@/components/ui/Mark";

/*
 * The frame for the public pages a club reads before it has an account: the
 * privacy page and the data agreement. Set in the home page's daylight, with
 * the same masthead and footer, so a committee member following a link from
 * the home page never feels they have left it.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="daylight">
      <main className="min-h-screen overflow-x-clip bg-stage text-ink">
        <header className="border-b border-line">
          <div className="sheet flex items-center justify-between py-4">
            <Link href="/" className="flex items-center gap-3" aria-label="Ardawn home">
              <Mark className="h-7" />
              <span className="wordmark text-[25px] leading-none">Ardawn</span>
            </Link>
            <a href="/login" className="btn-outline">
              Sign in
            </a>
          </div>
        </header>

        {children}

        <footer className="border-t border-line">
          <div className="sheet flex flex-col gap-4 py-8 text-[13px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="wordmark text-[18px]">
              Ardawn
            </Link>
            <a href="mailto:hello@ardawnsport.ie" className="hover:text-ink">
              hello@ardawnsport.ie
            </a>
            <a href="/privacy" className="hover:text-ink">
              Privacy and footage
            </a>
            <a href="/privacy/agreement" className="hover:text-ink">
              Data agreement
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* A question on the rule, its answer beside it: the home page's week rows, for prose. */
export function Answer({ q, children }: { q: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-line py-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-20">
      <dt className="title text-[19px]">{q}</dt>
      <dd className="measure space-y-4 text-[15px] leading-relaxed text-ink-dim sm:text-[16px]">
        {children}
      </dd>
    </div>
  );
}
