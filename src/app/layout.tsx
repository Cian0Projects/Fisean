import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Chivo } from "next/font/google";
import { SITE, SITE_DESCRIPTION, SITE_TITLE, socialFor } from "@/lib/seo";
import "./globals.css";

/**
 * One typeface, working across its weights.
 *
 * Chivo is a grotesque with the heft of the faces a local printer sets a
 * match programme in: at black weight it carries an opponent's name across
 * a page, at regular it reads as plainly as a fixture list. It is sturdy in
 * its figures — squared, open, tabular on request — which is what a
 * scoreline, a timecode and a column of jersey numbers all need.
 *
 * next/font downloads it at build time and serves it from this app, so a
 * player's phone never asks Google for anything.
 */
const chivo = Chivo({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-chivo",
});

/*
 * A second face for the public home page's headlines only. A condensed
 * grotesque is what a scoreboard, a jersey number and a county final
 * programme cover are set in, so it reads as sport before a word of it is
 * read; Chivo at black weight, tightly tracked, reads as a startup. The app
 * itself keeps the one face above.
 */
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-display",
});

/*
 * What search results and shared links show for any page that does not set
 * its own. The title and description lead with what people type into a
 * search box (GAA, video review, the four codes) rather than with a slogan.
 * Canonical URLs are set page by page, never here: a canonical on the root
 * layout would tell Google every page is the home page.
 *
 * The share image is app/opengraph-image.tsx, picked up by Next without being
 * named here.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Ardawn",
  appleWebApp: { capable: true, statusBarStyle: "black", title: "Ardawn" },
  ...socialFor(SITE_TITLE, SITE_DESCRIPTION),
};

/* The browser's own bar matches the graphite every screen is set on. */
export const viewport: Viewport = {
  themeColor: "#111317",
  width: "device-width",
  initialScale: 1,
  // Players watch clips on phones; the video stage should reach the edges.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IE" className={`${chivo.variable} ${barlowCondensed.variable}`}>
      <body>{children}</body>
    </html>
  );
}
