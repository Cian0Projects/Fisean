import type { Metadata } from "next";
import { socialFor } from "@/lib/seo";
import { StartForm } from "./StartForm";

/*
 * The page a club secretary lands on from a search or a shared link, so it
 * says what it is for rather than inheriting the home page's title, which
 * would make two pages in the sitemap look like duplicates of each other.
 */
const TITLE = "Set up your club on Ardawn";
const DESCRIPTION =
  "Create your club's space on Ardawn, drop in a match, and send the panel one code so they can watch it on their phones.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/start" },
  ...socialFor(TITLE, DESCRIPTION),
};

/**
 * A server page around a client form, so the page has its own title and
 * description. Links sent out with ?code= from when a sign-up code was asked
 * for still work: the code is simply not needed any more.
 */
export default function StartPage() {
  return <StartForm />;
}
