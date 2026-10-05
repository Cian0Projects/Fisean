import type { MetadataRoute } from "next";

/**
 * What a phone needs to install Físeán to its home screen.
 *
 * It starts on `/m`, the phone layout, because someone tapping an icon on a
 * phone wants to watch Sunday's match, not the coach's desk. The native
 * Android and iOS shells in `mobile/` open the same address, so the
 * installed web app and the store app are one screen with two wrappers.
 *
 * There is no service worker. A match is gigabytes of range requests
 * against the club's own server; there is nothing useful to show offline,
 * and a stale cached shell is worse than an honest "cannot reach the club".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Físeán",
    short_name: "Físeán",
    description: "Watch and clip hurling match footage.",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0f0d",
    theme_color: "#0a0f0d",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
