import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Físeán — hurling video review",
  description:
    "Clip, tag and share hurling match footage. Built for GAA teams.",
  applicationName: "Físeán",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Físeán" },
};

export const viewport: Viewport = {
  themeColor: "#0b0e12",
  width: "device-width",
  initialScale: 1,
  // Players watch clips on phones; the video stage should reach the edges.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
