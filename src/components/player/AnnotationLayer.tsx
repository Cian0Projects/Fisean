"use client";

/**
 * Drawing over the video.
 *
 * SVG rather than canvas, for three reasons that all matter here: shapes stay
 * individually selectable and deletable, they scale to any player size for
 * free, and they serialise straight to the database as JSON. A canvas would
 * hand us a bitmap that is wrong the moment somebody watches on a phone.
 *
 * Coordinates are normalised 0–1 against the video frame. Pixel positions are
 * derived at render time from the measured container, so the same annotation
 * lands on the same blade of grass on a laptop and on a phone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Shape } from "@/lib/db/schema";

export type Tool = "arrow" | "ellipse" | "freehand" | "spotlight" | "text";

export const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: "arrow", label: "Arrow", key: "1" },
  { tool: "ellipse", label: "Circle", key: "2" },
  { tool: "freehand", label: "Pen", key: "3" },
  { tool: "spotlight", label: "Spotlight", key: "4" },
  { tool: "text", label: "Label", key: "5" },
];

export const COLOURS = ["#f0a92b", "#2fb56b", "#e5484d", "#38bdf8", "#ffffff"];

type Props = {
  shapes: Shape[];
  onChange?: (shapes: Shape[]) => void;
  tool?: Tool;
  colour?: string;
  /** When false the layer only displays, and pointer events pass through. */
  editable?: boolean;
};

export function AnnotationLayer({
  shapes,
  onChange,
  tool = "arrow",
  colour = COLOURS[0],
  editable = false,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Shape | null>(null);
  const drawing = useRef(false);

  // The overlay must track the video box exactly, including when the window
  // resizes or the player goes fullscreen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toNorm = useCallback((e: React.PointerEvent): [number, number] => {
    const rect = ref.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    ];
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toNorm(e);
    drawing.current = true;

    if (tool === "text") {
      const body = window.prompt("Label");
      drawing.current = false;
      if (body?.trim()) {
        onChange?.([...shapes, { type: "text", x, y, body: body.trim(), colour, size: 0.04 }]);
      }
      return;
    }

    const started: Shape =
      tool === "arrow"
        ? { type: "arrow", x1: x, y1: y, x2: x, y2: y, colour, width: 0.005 }
        : tool === "ellipse"
          ? { type: "ellipse", cx: x, cy: y, rx: 0, ry: 0, colour, width: 0.005 }
          : tool === "spotlight"
            ? { type: "spotlight", cx: x, cy: y, r: 0, colour }
            : { type: "freehand", points: [[x, y]], colour, width: 0.005 };

    setDraft(started);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!editable || !drawing.current || !draft) return;
    const [x, y] = toNorm(e);

    setDraft((d) => {
      if (!d) return d;
      switch (d.type) {
        case "arrow":
          return { ...d, x2: x, y2: y };
        case "ellipse":
          return { ...d, rx: Math.abs(x - d.cx), ry: Math.abs(y - d.cy) };
        case "spotlight":
          return { ...d, r: Math.hypot(x - d.cx, y - d.cy) };
        case "freehand": {
          const last = d.points[d.points.length - 1];
          // Thin the path as it is drawn — a raw pointer stream is far more
          // detail than anyone can see, and it bloats the stored row.
          if (Math.hypot(x - last[0], y - last[1]) < 0.004) return d;
          return { ...d, points: [...d.points, [x, y]] };
        }
        default:
          return d;
      }
    });
  };

  const onPointerUp = () => {
    if (!editable || !draft) return;
    drawing.current = false;

    // Discard taps that did not actually draw anything.
    const meaningful =
      (draft.type === "arrow" && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 0.01) ||
      (draft.type === "ellipse" && draft.rx > 0.01 && draft.ry > 0.01) ||
      (draft.type === "spotlight" && draft.r > 0.02) ||
      (draft.type === "freehand" && draft.points.length > 2);

    if (meaningful) onChange?.([...shapes, draft]);
    setDraft(null);
  };

  const all = draft ? [...shapes, draft] : shapes;
  const { w, h } = size;
  // Scale stroke widths off the smaller edge so lines look the same weight
  // whatever the aspect ratio.
  const unit = Math.min(w, h) || 1;

  return (
    <svg
      ref={ref}
      className={`absolute inset-0 h-full w-full ${
        editable ? "cursor-crosshair" : "pointer-events-none"
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        {COLOURS.map((c) => (
          <marker
            key={c}
            id={`arrow-${c.replace("#", "")}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
          </marker>
        ))}
        {/* A spotlight is a dim overlay with a hole punched in it. */}
        <mask id="spotlight-mask">
          <rect x="0" y="0" width={w} height={h} fill="white" />
          {all
            .filter((s): s is Extract<Shape, { type: "spotlight" }> => s.type === "spotlight")
            .map((s, i) => (
              <circle key={i} cx={s.cx * w} cy={s.cy * h} r={s.r * unit} fill="black" />
            ))}
        </mask>
      </defs>

      {all.some((s) => s.type === "spotlight") && (
        <rect
          x="0"
          y="0"
          width={w}
          height={h}
          fill="rgba(0,0,0,0.62)"
          mask="url(#spotlight-mask)"
        />
      )}

      {all.map((s, i) => {
        const key = `${s.type}-${i}`;
        switch (s.type) {
          case "arrow":
          case "line":
            return (
              <line
                key={key}
                x1={s.x1 * w}
                y1={s.y1 * h}
                x2={s.x2 * w}
                y2={s.y2 * h}
                stroke={s.colour}
                strokeWidth={s.width * unit}
                strokeLinecap="round"
                markerEnd={
                  s.type === "arrow" ? `url(#arrow-${s.colour.replace("#", "")})` : undefined
                }
              />
            );
          case "ellipse":
            return (
              <ellipse
                key={key}
                cx={s.cx * w}
                cy={s.cy * h}
                rx={s.rx * w}
                ry={s.ry * h}
                fill="none"
                stroke={s.colour}
                strokeWidth={s.width * unit}
              />
            );
          case "rect":
            return (
              <rect
                key={key}
                x={s.x * w}
                y={s.y * h}
                width={s.w * w}
                height={s.h * h}
                fill="none"
                stroke={s.colour}
                strokeWidth={s.width * unit}
              />
            );
          case "freehand":
            return (
              <polyline
                key={key}
                points={s.points.map(([x, y]) => `${x * w},${y * h}`).join(" ")}
                fill="none"
                stroke={s.colour}
                strokeWidth={s.width * unit}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          case "spotlight":
            return (
              <circle
                key={key}
                cx={s.cx * w}
                cy={s.cy * h}
                r={s.r * unit}
                fill="none"
                stroke={s.colour}
                strokeWidth={0.003 * unit}
              />
            );
          case "text":
            return (
              <text
                key={key}
                x={s.x * w}
                y={s.y * h}
                fill={s.colour}
                fontSize={s.size * unit}
                fontWeight="600"
                stroke="rgba(0,0,0,0.75)"
                strokeWidth={0.006 * unit}
                paintOrder="stroke"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                {s.body}
              </text>
            );
          default:
            return null;
        }
      })}
    </svg>
  );
}
