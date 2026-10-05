import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The phone apps are a native window onto the club's own Físeán server.
 *
 * Nothing is bundled into the app but a page to show when the server cannot
 * be reached. Everything else — sign-in, footage, clips — comes live from the
 * address below, so the app is never out of date with the server, a fix to
 * the phone screens ships the moment the server is redeployed, and there is
 * no second copy of the auth or the clip rules to keep in step.
 *
 * Set FISEAN_URL before `npm run sync`; it is read then and baked into the
 * native projects:
 *
 *   FISEAN_URL=https://fisean.yourclub.ie npm run sync      the real server
 *   FISEAN_URL=http://192.168.1.20:3000 npm run sync        your PC on the WiFi
 *   FISEAN_URL=http://10.0.2.2:3000 npm run sync            the Android emulator's
 *                                                            name for your PC
 */
const url = (process.env.FISEAN_URL ?? "http://10.0.2.2:3000").replace(/\/$/, "");

const config: CapacitorConfig = {
  appId: "ie.fisean.app",
  appName: "Físeán",
  webDir: "www",
  backgroundColor: "#0a0f0d",
  server: {
    // Open on the phone layout; the full site is a link away inside it.
    url: `${url}/m`,
    // Plain http is only for testing against a PC on the club WiFi. The
    // real server is https, and then this is off.
    cleartext: url.startsWith("http://"),
    // Shown instead of a blank white screen when the server is unreachable.
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    // The page handles the notch itself with env(safe-area-inset-*).
    contentInset: "never",
  },
};

export default config;
