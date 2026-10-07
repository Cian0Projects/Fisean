import type { Metadata, Viewport } from "next";
import { Chivo } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Ardawn — GAA video review",
  description:
    "Clip, tag and share GAA match footage. Built for teams.",
  applicationName: "Ardawn",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Ardawn" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  // Players watch clips on phones; the video stage should reach the edges.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={chivo.variable}>
      <body>{children}</body>
    </html>
  );
}
