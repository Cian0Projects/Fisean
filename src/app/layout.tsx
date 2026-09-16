import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

/**
 * One typeface, working across its width axis.
 *
 * Archivo is a grotesque drawn for signage and tables, and it carries a real
 * width axis — so the same family squeezes to 68% for a scoreline read across
 * a dressing room and relaxes to normal for a paragraph. Scoreboards and
 * jersey numbers are condensed for exactly that reason: the space is fixed
 * and the number is the message.
 *
 * next/font downloads it at build time and serves it from this app, so a
 * player's phone never asks Google for anything.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "Físeán — hurling video review",
  description:
    "Clip, tag and share hurling match footage. Built for GAA teams.",
  applicationName: "Físeán",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Físeán" },
};

export const viewport: Viewport = {
  themeColor: "#0a0f0d",
  width: "device-width",
  initialScale: 1,
  // Players watch clips on phones; the video stage should reach the edges.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
