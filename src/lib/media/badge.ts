/**
 * The club badge: what an admin may upload, and the size it is kept at.
 *
 * The admin's browser does the real work. It draws whatever image it was
 * given onto a canvas no larger than BADGE_PX and saves that as a PNG, so the
 * server only ever receives one small, freshly encoded format. The server
 * still checks, because a request can come from anywhere: it accepts a PNG
 * and nothing else, by its signature rather than its file name, and refuses
 * SVG outright since an SVG can carry script.
 *
 * Kept free of the database and of the DOM so the tests can import it.
 */

/** Twice the largest size it is drawn at, so it stays sharp on a phone. */
export const BADGE_PX = 256;

/** Generous for a 256-pixel PNG; a photograph would come in well under. */
export const BADGE_MAX_BYTES = 512 * 1024;

/** The kinds of file the picker offers. All become a PNG before upload. */
export const BADGE_ACCEPT = "image/png,image/jpeg,image/webp";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Scale down to fit inside a `max` square, keeping the shape. Never scales up. */
export function fitWithin(
  width: number,
  height: number,
  max: number = BADGE_PX,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Width and height from a PNG's header, or null when the bytes are not a PNG.
 * The first chunk of every PNG is IHDR, and it opens with the two numbers.
 */
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunk !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** What is wrong with an uploaded badge, in words for the admin, or null. */
export function badgeProblem(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "Choose an image for the badge.";
  if (bytes.length > BADGE_MAX_BYTES) return "That image is too large. Try a smaller one.";
  const size = pngDimensions(bytes);
  if (!size) return "That file is not an image Ardawn can use. Try a PNG or JPEG.";
  // The browser scales to BADGE_PX; anything much bigger did not come from it.
  if (size.width > BADGE_PX * 2 || size.height > BADGE_PX * 2) {
    return "That image is too large. Try a smaller one.";
  }
  return null;
}
