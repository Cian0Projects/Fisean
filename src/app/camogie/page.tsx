import type { Metadata } from "next";
import { CodePage } from "@/components/home/CodePage";
import { codePageMetadata } from "@/lib/code-pages";

/* The public page for one code. Its words are in src/lib/code-pages.ts. */
export const metadata: Metadata = codePageMetadata("camogie");

export default function CamogiePage() {
  return <CodePage code="camogie" />;
}
