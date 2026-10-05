# Físeán on phones

There are three ways onto a phone, and they all show the same screens: the
phone layout at `/m`, served by the club's own Físeán server.

| | What it is | Costs | Needs |
|---|---|---|---|
| **Home-screen app** | Open the site in Safari or Chrome, then *Add to Home Screen*. Opens full screen with its own icon. | Nothing | The server on **https** |
| **Android app** | This folder's `android/` project, built into an APK or a Play Store listing. | €0 to side-load; $25 once for Google Play | Android Studio |
| **iPhone app** | This folder's `ios/` project, through TestFlight or the App Store. | $99 a year for an Apple developer account | A Mac with Xcode |

Start with the home-screen app. It needs no store, no fees and no Mac, and it
is the same screen the native apps show. Build the native apps once the squad
has used it for a few weeks and you know you want an icon in the store.

## Why the apps are this thin

The apps bundle nothing except a "Cannot reach the club" page. Sign-in,
footage and clips all come live from the server named in `capacitor.config.ts`.
That means:

- A fix to the phone screens reaches every phone as soon as the server is
  redeployed. Nobody has to update the app.
- There is one copy of the sign-in, the permission rules and the clip rules,
  on the server, where they already live.
- The main app keeps its seven runtime dependencies. Capacitor lives here,
  in its own `package.json`, and never touches the server's `node_modules`.

One consequence: Apple may turn down a public App Store listing for a thin
app like this under guideline 4.2, "minimum functionality". A club app does
not need a public listing. **TestFlight** is the practical way onto a panel of
30 or 40 iPhones: up to 100 *internal* testers need no review but must each
be added as users of your App Store Connect account; *external* testers join
from a public link after a lighter beta review. A TestFlight build lasts 90
days, so plan to upload a fresh one each season.

## What the phone screens do

- **Matches**: newest first, and the clips you are tagged in.
- **Watch**: the video stays pinned at the top while the clip list scrolls
  beneath it. Turn the phone sideways and the video fills the screen. There
  are buttons to skip 10 seconds back or forward, slow motion at ½× and ¼×,
  and full screen.
- **Clip that**: tap after you see something. It keeps the 8 seconds you just
  watched plus 3 after, the same as the `C` key on the desktop.
- **Mark start, then End clip**: for a passage whose length you choose.
- Either way, a sheet rises to trim with −1 s / +1 s, add a title, tag the
  event, name who is in it, and choose the squad or only you.
- The clip list has *All*, *Mine* and *I'm in* filters. Tap a clip to play it.
  Tap *Edit* on your own clips (or on anyone's, as a coach).

The stat sheet is left out on purpose. It stays on the desktop.

---

## Testing

### 1. In a desktop browser (a few seconds)

With `npm run dev` running, open <http://localhost:3000/m> in Chrome, press
F12, then Ctrl+Shift+M for device mode, and pick an iPhone or Pixel. Use
this for layout. Touch handling and video decoding on a real phone still
differ, so do not stop here.

### 2. On your own phone, over the club WiFi (a few minutes)

```bash
npm run lan                       # in the repository root
ipconfig                          # note your PC's IPv4 address, e.g. 192.168.1.20
```

On the phone, on the same WiFi, open `http://192.168.1.20:3000/m`. If it does
not load, allow Node.js through Windows Firewall on private networks.

*Add to Home Screen* needs https, so it does not work at this step. Step 3
fixes that.

### 3. The home-screen app, over https

Either deploy the server as in [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md),
or use Tailscale on your PC and phone: `tailscale serve 3000` gives the PC an
https address that only your own devices can reach.

- **iPhone**: open the address in **Safari**, tap Share, then *Add to Home
  Screen*.
- **Android**: open it in **Chrome**, then tap the menu and *Install app*.

### 4. The Android app, in the emulator

One-time setup: install [Android Studio](https://developer.android.com/studio).
It brings the Android SDK, a Java runtime and the emulator. In Android
Studio, open *Device Manager* and create a Pixel device.

```bash
cd mobile
npm install
npm run android                   # syncs, then opens the project in Android Studio
```

Press the green Run button. The emulator reaches your PC at `10.0.2.2`, which
is the default server address, so `npm run dev` on your PC is all it needs.

### 5. The Android app, on your own phone

On the phone, turn on *Developer options* (tap *Build number* in *About phone*
seven times), then *USB debugging*. Plug it in.

```bash
cd mobile
FISEAN_URL=http://192.168.1.20:3000 npm run android     # your PC's WiFi address
```

In PowerShell, set the variable first: `$env:FISEAN_URL="http://192.168.1.20:3000"`.
Pick the phone in Android Studio's device list and press Run.

To hand the app to the squad without Google Play, build an APK:
*Build > Generate Signed App Bundle / APK > APK*. Point it at the real server
first (`FISEAN_URL=https://fisean.yourclub.ie npm run sync`). Send the file
round and each player allows *Install unknown apps* once.

### 6. The iPhone app

This needs a Mac with Xcode. Without one, borrow a Mac for an afternoon,
rent one by the hour (MacinCloud and similar), or build in the cloud with
Codemagic or a GitHub Actions macOS runner.

```bash
cd mobile
npm install
FISEAN_URL=https://fisean.yourclub.ie npm run ios       # opens Xcode
```

In Xcode, choose your team under *Signing & Capabilities*, plug in an iPhone,
and press Run. To reach the squad: *Product > Archive*, upload to App Store
Connect, and add the players as TestFlight testers.

The iOS project allows plain http to **local network addresses only**, so a
test build can reach your PC on the WiFi. Everything on the internet still
needs https.

### Debugging a real phone

- **Android**: with the phone plugged in, open `chrome://inspect` in Chrome
  on the PC. The app's web view is listed with a full DevTools inspector.
- **iPhone**: on the phone, turn on *Settings > Safari > Advanced > Web
  Inspector*. On a Mac, Safari's *Develop* menu then lists the phone.

### What to check on a real phone

- A 70-minute match starts playing within a couple of seconds, and scrubbing
  lands where you let go.
- *Clip that* while playing, then save. The clip is in the list at once and
  still there after a reload.
- Turn the phone sideways during play: the video fills the screen.
- Tap the title field in the clip sheet: the page must not zoom in.
- Sign out, then sign in again: you land back on the phone layout, not the
  desktop dashboard.
- Turn on flight mode inside the app: you see "Cannot reach the club", not a
  white screen.

---

## Changing the logo

The mark (goalposts with a sliotar over the bar) is drawn in code in
`src/components/ui/Mark.tsx`. That one file feeds the nav, the phone header,
the sign-in screen, and the browser tab, home-screen and Apple icons
(`/icon/32`, `/icon/192`, `/icon/512`, `/apple-icon`). Keep
`docs/brand/fisean-mark.svg` in step with it.

The native apps need PNG files instead. After changing the drawing, render a
1024 px `assets/icon-only.png` and a 2732 px `assets/splash.png` from
`MarkTile`, then regenerate:

```bash
cd mobile
npx @capacitor/assets generate --android --ios   --iconBackgroundColor "#0a0f0d" --splashBackgroundColor "#0a0f0d"
```
