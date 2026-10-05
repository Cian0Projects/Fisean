import { ImageResponse } from "next/og";
import { MarkTile } from "@/components/ui/Mark";

/**
 * The tab and home-screen icons, drawn rather than shipped as PNGs.
 *
 * 192 and 512 are what the web manifest lists; the 512 also serves as the
 * maskable icon, so the mark stays inside the middle 60% Android crops to.
 * The 32 is the browser tab, where there is no crop to survive and the mark
 * has to be as big as it can be to stay legible.
 */
const SIZES = [
  { px: 32, fill: 0.86 },
  { px: 192, fill: 0.58 },
  { px: 512, fill: 0.58 },
];

export function generateImageMetadata() {
  return SIZES.map(({ px }) => ({
    id: String(px),
    contentType: "image/png",
    size: { width: px, height: px },
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const want = Number(await id);
  const { px, fill } = SIZES.find((s) => s.px === want) ?? SIZES[1];
  return new ImageResponse(<MarkTile px={px} fill={fill} />, { width: px, height: px });
}
