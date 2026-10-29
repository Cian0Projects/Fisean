"use client";

/**
 * Add a player by name, for someone who has no account yet. Shared by the
 * panel and the number sheet, since a coach finds the name missing in the
 * second and an admin tidies the list in the first.
 */
import { useState, useTransition } from "react";
import { addPlayer } from "@/lib/actions/admin";
import { MAX_PLAYER_NAME } from "@/lib/hurling/squad";

export function AddPlayer({
  onAdded,
  id = "add-player",
}: {
  onAdded?: (player: { id: string; displayName: string }) => void;
  id?: string;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setAdded(null);
        startTransition(async () => {
          const result = await addPlayer(name);
          if ("error" in result) {
            setError(result.error);
            return;
          }
          setName("");
          setAdded(result.player.displayName);
          onAdded?.(result.player);
        });
      }}
    >
      <label htmlFor={id} className="label mb-1.5 block">
        Add a player with no account yet
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_PLAYER_NAME}
          autoComplete="off"
          placeholder="Full name"
          className="field w-56"
        />
        <button type="submit" disabled={pending || !name.trim()} className="btn-outline">
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="caption mt-1.5">
        They can be given a number and have stats logged against them straight away. When they join
        Ardawn, a club admin adds their email and it is all theirs.
      </p>
      {error && (
        <p role="alert" className="mt-1.5 text-[12px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
      {added && !error && (
        <p role="status" className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
          {added} is on the panel.
        </p>
      )}
    </form>
  );
}
