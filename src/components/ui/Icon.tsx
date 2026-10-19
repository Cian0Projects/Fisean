/**
 * The few transport icons the app draws, as SVG rather than Unicode.
 *
 * A "▶" is a character, so it takes whatever shape the fallback font gives
 * it and sits on the text baseline — a different triangle on every phone,
 * never quite centred in a round button. These are drawn once, on one 16-unit
 * grid, filled or stroked in `currentColor` so they take the ink of the
 * button they sit in.
 */

type IconProps = { className?: string; size?: number };

function Svg({ className, size = 12, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* Nudged right of centre: a triangle's visual weight sits left of its box. */}
      <path d="M4.5 2.5v11l9-5.5z" fill="currentColor" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="2.5" width="3" height="11" fill="currentColor" />
      <rect x="9.5" y="2.5" width="3" height="11" fill="currentColor" />
    </Svg>
  );
}

/** A microphone, for logging a stat by voice. */
export function MicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="currentColor" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

/** Four corners pointing out to go full screen, or in to leave it. */
export function FullScreenIcon({ exit = false, ...props }: IconProps & { exit?: boolean }) {
  return (
    <Svg {...props}>
      <path
        d={
          exit
            ? "M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5"
            : "M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
      />
    </Svg>
  );
}

/**
 * iOS's Share symbol: an arrow rising out of an open box. Drawn to match the
 * one printed on Safari's button, because "tap Share" only helps someone who
 * can pick the right icon out of a toolbar.
 */
export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 10V1.5M5 4.5l3-3 3 3M4.5 6.5H3.5v8h9v-8h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronIcon({ direction, ...props }: IconProps & { direction: "left" | "right" }) {
  return (
    <Svg {...props}>
      <path
        d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </Svg>
  );
}
