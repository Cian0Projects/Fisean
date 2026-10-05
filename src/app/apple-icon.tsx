import { ImageResponse } from "next/og";
import { MarkTile } from "@/components/ui/Mark";

/** iOS asks for its own 180 px icon and rounds the corners itself. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<MarkTile px={180} fill={0.6} />, size);
}
