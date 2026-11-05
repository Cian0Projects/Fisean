import Image from "next/image";
import Link from "next/link";
import { HOW_TOS, howToJsonLd, type HowTo } from "@/lib/how-to";
import { GUIDES } from "@/lib/guides";
import { jsonLdScript } from "@/lib/seo";

/**
 * One public how-to page (/how-to/[slug]). The words are in
 * src/lib/how-to.ts; this sets them in the privacy page's daylight, inside
 * PublicShell, because these are pages to read with the app open beside them
 * rather than a pitch.
 *
 * The steps are numbered in the headline face so a coach following along can
 * find their place at a glance, the way the numbered captions do in the
 * members' videos.
 */
export function HowToArticle({ guide }: { guide: HowTo }) {
  const video = guide.video ? GUIDES.find((g) => g.slug === guide.video) : undefined;
  const others = HOW_TOS.filter((h) => h.slug !== guide.slug);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(howToJsonLd(guide)) }}
      />
      <article>
        <header className="sheet pb-10 pt-12 sm:pb-12 sm:pt-16">
          <p className="mb-5 text-[13px] font-semibold text-ink-dim">
            <Link href="/how-to" className="hover:text-ink">
              How to
            </Link>
          </p>
          <h1 className="headline max-w-4xl text-[clamp(2.6rem,5.2vw,4.8rem)]">{guide.heading}</h1>
          <p className="measure mt-7 text-[17px] leading-relaxed text-ink-dim sm:text-[19px]">{guide.intro}</p>
          <p className="mt-4 text-[15px] text-ink-faint">{guide.who}</p>
        </header>

        {guide.image && (
          <div className="sheet pb-12 sm:pb-16">
            <Image
              src={guide.image.src}
              alt={guide.image.alt}
              width={1920}
              height={1080}
              sizes="(min-width: 1280px) 1200px, 100vw"
              priority
              className="block aspect-video h-auto w-full max-w-5xl border border-line-strong object-cover"
            />
          </div>
        )}

        <section className="sheet pb-14 sm:pb-20" aria-labelledby="steps">
          <h2 id="steps" className="section-head title text-[15px]">
            Step by step
          </h2>
          <ol className="m-0 list-none border-t-[3px] border-rule p-0">
            {guide.steps.map((s, i) => (
              <li
                key={s.title}
                className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 border-b border-line py-7 sm:grid-cols-[4.5rem_minmax(0,1fr)]"
              >
                <span className="headline text-[clamp(2rem,3.4vw,2.8rem)] leading-none text-ink-faint" aria-hidden>
                  {i + 1}
                </span>
                <div>
                  <h3 className="title text-[19px]">{s.title}</h3>
                  <p className="measure mt-2 text-[15px] leading-relaxed text-ink-dim sm:text-[16px]">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {(guide.tips.length > 0 || video) && (
          <section className="sheet pb-16 sm:pb-20" aria-labelledby="tips">
            <h2 id="tips" className="section-head title text-[15px]">
              Worth knowing
            </h2>
            <dl className="m-0 border-t-[3px] border-rule">
              {guide.tips.map((t) => (
                <div
                  key={t.title}
                  className="grid gap-3 border-b border-line py-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-20"
                >
                  <dt className="title text-[19px]">{t.title}</dt>
                  <dd className="measure m-0 text-[15px] leading-relaxed text-ink-dim sm:text-[16px]">{t.text}</dd>
                </div>
              ))}
              {video && (
                <div className="grid gap-3 border-b border-line py-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-20">
                  <dt className="title text-[19px]">Watch it done</dt>
                  <dd className="measure m-0 text-[15px] leading-relaxed text-ink-dim sm:text-[16px]">
                    Members can watch this as a short video, &ldquo;{video.title}&rdquo;, on the Help page once
                    they sign in.
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}
      </article>

      <SetUpBand />

      <nav className="sheet py-14 sm:py-16" aria-labelledby="more-guides">
        <h2 id="more-guides" className="section-head title text-[15px]">
          More guides
        </h2>
        <GuideList guides={others} />
      </nav>
    </>
  );
}

/** The list of guides: on /how-to, and under each guide for the others. */
export function GuideList({ guides }: { guides: readonly HowTo[] }) {
  return (
    <ul className="m-0 list-none border-t-[3px] border-rule p-0">
      {guides.map((h) => (
        <li key={h.slug} className="border-b border-line">
          <Link
            href={`/how-to/${h.slug}`}
            className="group flex items-baseline justify-between gap-6 py-6"
          >
            <span>
              <span className="title block text-[19px] group-hover:underline">{h.heading}</span>
              <span className="mt-1.5 block text-[15px] leading-relaxed text-ink-dim">{h.blurb}</span>
            </span>
            <span className="text-[22px] leading-none text-ink-faint" aria-hidden>
              &rarr;
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* The way on from a guide: start a club, or join one with a code. */
export function SetUpBand() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="sheet flex flex-col gap-6 py-12 sm:flex-row sm:items-end sm:justify-between sm:py-14">
        <div>
          <h2 className="headline max-w-xl text-[clamp(2.3rem,4.4vw,3.6rem)]">Try it on your next match.</h2>
          <p className="mt-3 text-[15px] text-ink-dim">
            For hurling, camogie, Gaelic football and ladies football. From €250 a year for a team.
          </p>
        </div>
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
  );
}
