import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/home/PublicShell";
import { HowToArticle } from "@/components/home/HowToPage";
import { HOW_TOS, howTo, howToMetadata } from "@/lib/how-to";

/* One public how-to guide. Only the guides in src/lib/how-to.ts exist. */
export const dynamicParams = false;

export function generateStaticParams() {
  return HOW_TOS.map((h) => ({ slug: h.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = howTo((await params).slug);
  return guide ? howToMetadata(guide) : {};
}

export const viewport: Viewport = { themeColor: "#ffffff" };

export default async function HowToGuide({ params }: Props) {
  const guide = howTo((await params).slug);
  if (!guide) notFound();
  return (
    <PublicShell>
      <HowToArticle guide={guide} />
    </PublicShell>
  );
}
