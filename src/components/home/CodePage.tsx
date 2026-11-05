import Image from "next/image";
import Link from "next/link";
import { CodeTabs } from "@/components/home/CodeTabs";
import type { GameCode } from "@/lib/hurling/codes";
import { CODE_PAGES, codePage, codePageJsonLd, type CodeScreen } from "@/lib/code-pages";
import { jsonLdScript } from "@/lib/seo";
import { openGuides } from "@/lib/guides";
import { Mark } from "@/components/ui/Mark";
import { GuideCard } from "@/components/help/GuideCard";
import { RevealOnScroll } from "@/components/home/RevealOnScroll";

/**
 * One code's public page (/hurling, /camogie, /gaelic-football,
 * /ladies-football). The words live in src/lib/code-pages.ts; this is how
 * they are set.
 *
 * It is the home page's dark room, cut down: the same masthead over that
 * code's photograph, the same four-up of what Ardawn does, the same rows of
 * real screens, questions, getting-started videos and the closing call to
 * set up a club. What it adds is the middle section on what is particular to
 * the code, which is the reason the page exists. A visitor arriving from a
 * search should feel they are on the home page, made for their game, and
 * every way off it leads back into the one site.
 */
export function CodePage({ code }: { code: GameCode }) {
  const page = codePage(code);
  return (
    <div className="dark-room">
      <main className="min-h-screen overflow-x-clip bg-stage text-ink">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(codePageJsonLd(code)) }}
        />
        <RevealOnScroll />

        <section className="code-hero code-hero-page">
          <div className="code-slide" aria-hidden data-state="showing">
            <Image
              src={page.photo.src}
              alt=""
              fill
              sizes="100vw"
              priority
              className="code-slide-photo"
              style={page.photo.focus ? { objectPosition: page.photo.focus } : undefined}
            />
          </div>
          <span className="code-shade" aria-hidden />

          <header className="code-hero-top">
            <div className="sheet flex items-center justify-between py-4">
              <Link href="/" className="flex items-center gap-3" aria-label="Ardawn home">
                <Mark className="h-7" />
                <span className="wordmark text-[25px] leading-none">Ardawn</span>
              </Link>
              <nav className="flex items-center gap-2 sm:gap-5" aria-label="Main navigation">
                <a href="#how-it-works" className="hidden text-[13px] font-semibold text-ink-dim hover:text-ink sm:inline">
                  How it works
                </a>
                <Link href="/#pricing" className="hidden text-[13px] font-semibold text-ink-dim hover:text-ink sm:inline">
                  Prices
                </Link>
                <a href="/login" className="btn-outline">
                  Sign in
                </a>
              </nav>
            </div>
            <CodeTabs current={code} />
          </header>

          <div className="sheet flex flex-1 flex-col justify-center py-14 sm:py-20">
            <p className="text-[14px] font-semibold text-ink-dim">Ardawn for {page.named}</p>
            <h1 className="headline mt-3 max-w-4xl text-[clamp(2.9rem,5.4vw,5.6rem)]">{page.headline}</h1>
            <p className="measure mt-6 text-[17px] leading-relaxed text-ink sm:text-[19px]">{page.intro}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a href="/start" className="btn-brand px-6 py-3.5 text-[15px]">
                Set up your club or county
              </a>
              <a href="#how-it-works" className="btn-outline px-6 py-3.5 text-[15px]">
                See how it works
              </a>
            </div>
          </div>
        </section>

        <section className="sheet pb-14 pt-14 sm:pb-20 sm:pt-20" aria-label="What Ardawn does">
          <dl className="grid border-t-[3px] border-rule sm:grid-cols-2 lg:grid-cols-4">
            <Feature name="Watch">{page.features.watch}</Feature>
            <Feature name="Clip">{page.features.clip}</Feature>
            <Feature name="Stats">{page.features.stats}</Feature>
            <Feature name="Drills">{page.features.drills}</Feature>
          </dl>
        </section>

        {/* The section the page is for: what Ardawn does that is particular
            to this code. Set like the home page's questions, a heading on the
            left and the rows on the rule beside it. */}
        <section className="border-t border-line" aria-labelledby="built-for">
          <div className="sheet grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-20">
            <h2 id="built-for" className="headline text-[clamp(2.7rem,5vw,4.4rem)]">
              Built for {page.named}.
            </h2>
            <dl className="m-0 border-t-[3px] border-rule">
              {page.rules.map((r) => (
                <div key={r.name} className="border-b border-line py-6">
                  <dt className="title text-[19px]">{r.name}</dt>
                  <dd className="measure m-0 mt-2 text-[15px] leading-relaxed text-ink-dim sm:text-[16px]">{r.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="sheet border-t border-line pb-8 pt-14 sm:pb-12 sm:pt-20" id="how-it-works">
          <h2 className="section-head title text-[15px]">A closer look</h2>
          <div className="divide-y divide-line">
            {/* Rows with a screenshot zigzag as on the home page; the ones
                this code has no screenshot for sit side by side after them,
                so a page with only one picture is not half empty. */}
            {page.screens
              .filter((s) => s.image)
              .map((s, i) => (
                <ScreenRow key={s.name} screen={s} flip={i % 2 === 1} />
              ))}
            {page.screens.some((s) => !s.image) && (
              <div className="grid lg:grid-cols-2 lg:gap-x-16">
                {page.screens
                  .filter((s) => !s.image)
                  .map((s) => (
                    <ScreenRow key={s.name} screen={s} flip={false} />
                  ))}
              </div>
            )}
          </div>
        </section>

        <section id="getting-started" className="border-t border-line" aria-label="Getting started">
          <div className="sheet py-16 sm:py-20">
            <h2 className="headline max-w-xl text-[clamp(2.7rem,5vw,4.4rem)]">Up and running in a minute.</h2>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2">
              {openGuides().map((g) => (
                <GuideCard key={g.slug} guide={g} />
              ))}
            </div>
            <p className="mt-10 text-[15px] text-ink-dim">
              Clipping, stats, drills and bringing footage in, step by step:{" "}
              <Link href="/how-to" className="font-semibold text-ink underline">
                every how to guide
              </Link>
            </p>
          </div>
        </section>

        <section id="questions" className="border-t border-line">
          <div className="sheet grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-20">
            <h2 className="headline text-[clamp(2.7rem,5vw,4.4rem)]">Questions clubs ask</h2>
            <div className="border-t-[3px] border-rule">
              {page.questions.map((item) => (
                <details key={item.q} className="group border-b border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="text-[22px] font-normal leading-none text-ink-faint transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="measure pb-6 text-[15px] leading-relaxed text-ink-dim">{item.a}</p>
                </details>
              ))}
              <p className="pt-6 text-[15px] text-ink-dim">
                Prices start at €250 a year for a team.{" "}
                <Link href="/#pricing" className="font-semibold text-ink underline">
                  See every plan
                </Link>
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="sheet flex flex-col gap-6 py-14 sm:flex-row sm:items-end sm:justify-between sm:py-16">
            <h2 className="headline max-w-xl text-[clamp(2.7rem,5vw,4.4rem)]">Bring your next match in.</h2>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <a href="/start" className="btn-brand px-5 py-3 text-[14px]">
                Set up your club or county
              </a>
              <p className="text-[14px] text-ink-dim">
                Got a code?{" "}
                <a href="/join" className="font-semibold text-ink underline">
                  Join your team
                </a>
              </p>
            </div>
          </div>
        </section>

        <footer className="border-t border-line">
          <CodeLinks current={code} />
          <div className="sheet flex flex-col gap-4 py-8 text-[13px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="wordmark text-[18px]">
              Ardawn
            </Link>
            <a href="mailto:hello@ardawnsport.ie" className="hover:text-ink">
              hello@ardawnsport.ie
            </a>
            <Link href="/how-to" className="hover:text-ink">
              How to guides
            </Link>
            <a href="/privacy" className="hover:text-ink">
              Privacy and footage
            </a>
            <a href="/login" className="font-semibold text-ink">Sign in to your team</a>
          </div>
        </footer>
      </main>
    </div>
  );
}

/**
 * The four code pages, linked from the foot of the home page and of each
 * other. Plain links in the page, so a crawler arriving anywhere finds all
 * four. The page being read is named but not linked.
 */
export function CodeLinks({ current }: { current?: GameCode }) {
  return (
    <nav className="border-b border-line" aria-label="Ardawn for each code">
      <div className="sheet flex flex-wrap items-center gap-x-6 gap-y-2 py-5 text-[13px]">
        <span className="font-semibold text-ink-dim">Ardawn for</span>
        {CODE_PAGES.map((p) =>
          p.code === current ? (
            <span key={p.code} className="font-semibold text-ink" aria-current="page">
              {p.label}
            </span>
          ) : (
            <Link key={p.code} href={p.path} className="text-ink-faint hover:text-ink">
              {p.label}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}

function Feature({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-5 sm:pr-8 lg:border-b-0">
      <dt className="headline text-[27px]">{name}</dt>
      <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-dim">{children}</dd>
    </div>
  );
}

/*
 * The home page's screen row: words on one side, the real screen on the
 * other, alternating down the page. Without a screenshot for this code the
 * words stand alone, rather than borrow a picture of another code's game.
 */
function ScreenRow({ screen, flip }: { screen: CodeScreen; flip: boolean }) {
  const words = (
    <div data-reveal="" className={screen.image && flip ? "lg:order-2" : undefined}>
      <p className="text-[13px] font-semibold text-ink-faint">{screen.name}</p>
      <h3 className="headline mt-2 text-[clamp(2.3rem,3.8vw,3.4rem)]">{screen.title}</h3>
      <p className="mt-4 max-w-md text-[16px] leading-relaxed text-ink-dim sm:text-[17px]">{screen.text}</p>
    </div>
  );
  if (!screen.image) return <div className="py-12 sm:py-16">{words}</div>;
  return (
    <div
      className={`grid gap-8 py-12 sm:py-16 lg:items-center lg:gap-16 ${
        flip ? "lg:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]"
      }`}
    >
      {words}
      <Image
        src={screen.image.src}
        alt={screen.image.alt}
        width={1920}
        height={1080}
        sizes="(min-width: 1024px) 60vw, 100vw"
        data-reveal=""
        data-from={flip ? "left" : "right"}
        className={`block aspect-video h-auto w-full border border-line-strong object-cover ${screen.image.fit ?? "object-center"} ${flip ? "lg:order-1" : ""}`}
      />
    </div>
  );
}
