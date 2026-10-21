import type { Metadata } from "next";
import { connection } from "next/server";
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
 * A server page around a client form, only so it can read whether the host
 * has set `SIGNUP_CODE` — the form asks for one only when it is needed.
 */
export default async function StartPage() {
  // Read at request time, not baked in at build: the code is set on the
  // server, and changing it should not need a rebuild.
  await connection();
  return <StartForm needsCode={Boolean(process.env.SIGNUP_CODE)} />;
}
