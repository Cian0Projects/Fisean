"use client";

/**
 * Who can open this playlist, set by whoever may edit it. At the top of the
 * playlist, because that is where you are when you decide it is ready to
 * send.
 *
 * Shut, it is one line saying who can see it now; the picker opens on
 * "Change", so watching the playlist is not crowded by the panel's names.
 * The picker is the same one clips use (src/components/ui/AudiencePicker.tsx).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setPlaylistAudience } from "@/lib/actions/playlists";
import { describeAudience, type Audience } from "@/lib/auth/visibility";
import { AudiencePicker, type AudiencePerson } from "@/components/ui/AudiencePicker";

export function PlaylistAudience({
  playlistId,
  audience,
  makerId,
  maker,
  people,
  watched,
}: {
  playlistId: string;
  audience: Audience;
  makerId: string | null;
  /** "you" when the viewer made it. */
  maker: string;
  people: AudiencePerson[];
  /** The named people who have opened it. */
  watched: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(audience);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.displayName;
  const named = audience.userIds.length;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await setPlaylistAudience(playlistId, draft);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
        {describeAudience(audience, nameOf, maker)}
        {named > 0 && ` Watched by ${watched.length} of the ${named} named.`}
        <button
          onClick={() => {
            setDraft(audience);
            setOpen(true);
          }}
          className="underline"
        >
          Change who can see it
        </button>
      </p>
    );
  }

  return (
    <div className="mt-3 max-w-2xl border p-3" style={{ borderColor: "var(--color-line-strong)", borderRadius: 2 }}>
      <span className="label mb-1.5 block">Who can see it</span>
      <AudiencePicker value={draft} onChange={setDraft} people={people} makerId={makerId} maker={maker} />
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
        Anyone you name is emailed once to say it is there.
      </p>

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {error}
        </p>
      )}

      <div className="mt-3 flex justify-end gap-3">
        <button onClick={() => setOpen(false)} className="text-xs" style={{ color: "var(--color-ink-faint)" }}>
          Cancel
        </button>
        <button onClick={() => void save()} disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
