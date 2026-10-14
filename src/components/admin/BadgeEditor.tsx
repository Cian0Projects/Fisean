"use client";

import { useRef, useState, useTransition } from "react";
import { removeClubBadge, setClubBadge } from "@/lib/actions/admin";
import { BADGE_ACCEPT, BADGE_PX, fitWithin } from "@/lib/media/badge";
import { ClubBadge } from "@/components/ui/ClubBadge";

/**
 * The admin's badge, beside the club's name on the squad page. The badge is
 * the button: click it, or the empty dashed square before there is one, to
 * choose an image. The browser scales it down and saves it as a PNG before
 * it leaves, so a 6 MB photo of the crest on a jersey uploads as a few
 * kilobytes and the server only ever handles one format.
 */
export function BadgeEditor({ initial }: { initial: number | null }) {
  const [version, setVersion] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      let png: Blob;
      try {
        png = await toBadgePng(file);
      } catch {
        setError("That file could not be read as an image. Try a PNG or JPEG.");
        return;
      }
      const form = new FormData();
      form.append("badge", png, "badge.png");
      const result = await setClubBadge(form);
      if ("error" in result) setError(result.error);
      else setVersion(result.version);
    });
  }

  function remove() {
    if (!confirm("Remove the club badge?")) return;
    setError(null);
    startTransition(async () => {
      await removeClubBadge();
      setVersion(null);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="flex h-20 w-20 items-center justify-center p-1 text-center"
        style={
          version == null
            ? { border: "1.5px dashed var(--color-ash-dim)", borderRadius: 2, color: "var(--color-ink-faint)" }
            : undefined
        }
        aria-label={version == null ? "Add the club badge" : "Change the club badge"}
      >
        {version == null ? (
          <span className="text-[12px] leading-tight">{pending ? "Adding…" : "Add badge"}</span>
        ) : (
          <ClubBadge version={version} className="h-full w-full" />
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept={BADGE_ACCEPT}
        hidden
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {version != null && (
        <div className="flex gap-3 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className="underline">
            {pending ? "Saving…" : "Change"}
          </button>
          <button type="button" disabled={pending} onClick={remove} className="underline">
            Remove
          </button>
        </div>
      )}
      {error && (
        <p className="max-w-48 text-[12px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Draw the chosen image no larger than BADGE_PX a side and save it as a PNG. */
async function toBadgePng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, BADGE_PX);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No PNG"))), "image/png"),
  );
}
