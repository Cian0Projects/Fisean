import type { Metadata, Viewport } from "next";
import { PublicShell } from "@/components/home/PublicShell";
import { GuideList, SetUpBand } from "@/components/home/HowToPage";
import { HOW_TOS, howToIndexMetadata, howToJsonLd } from "@/lib/how-to";
import { jsonLdScript } from "@/lib/seo";

/*
 * The list of public how-to guides. Each is a task a coach searches for
 * before they have an account; the words are in src/lib/how-to.ts.
 */
export const metadata: Metadata = howToIndexMetadata();

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function HowToIndex() {
  return (
    <PublicShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(howToJsonLd()) }} />
      <section className="sheet pb-10 pt-12 sm:pb-14 sm:pt-16">
        <p className="mb-5 text-[13px] font-semibold text-ink-dim">How to</p>
        <h1 className="headline max-w-3xl text-[clamp(3rem,6vw,5.6rem)]">How to use Ardawn.</h1>
        <p className="measure mt-7 text-[17px] leading-relaxed text-ink-dim sm:text-[19px]">
          Step by step guides to the jobs a club does every week: clipping the match, keeping the stats,
          getting them to the panel, planning training and bringing footage in.
        </p>
      </section>
      <section className="sheet pb-16 sm:pb-20" aria-label="Guides">
        <GuideList guides={HOW_TOS} />
      </section>
      <SetUpBand />
    </PublicShell>
  );
}
