import { ImageResponse } from "next/og";
import { MarkTile } from "@/components/ui/Mark";

/**
 * The picture a link to Ardawn shows when it is pasted into WhatsApp, a
 * county board's group chat or a post. Drawn rather than shipped as a file,
 * like the icons, so it cannot drift from the mark.
 *
 * It says what the product is in the words a club would search for, on the
 * graphite every screen in the app is set on. Only colours the image needs
 * are written out, because ImageResponse cannot read the CSS tokens.
 */
export const alt = "Ardawn: GAA video review for hurling, camogie, Gaelic football and ladies football clubs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#111317",
          color: "#eceef2",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* MarkTile fills its parent, so it needs a box of its own. */}
          <div style={{ display: "flex", width: 112, height: 112 }}>
            <MarkTile px={112} fill={0.58} />
          </div>
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -1 }}>Ardawn</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            Every match, ready to watch back.
          </div>
          <div style={{ fontSize: 30, color: "#a6acb8" }}>
            Video review for hurling, camogie, Gaelic football and ladies football.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
