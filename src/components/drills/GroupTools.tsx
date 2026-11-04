"use client";

/**
 * Rename or delete the group being looked at. Only shown on a single group's
 * page, so the two controls never sit beside a list of groups where one could
 * be hit by mistake. Deleting keeps the drills; it says so, because "delete"
 * beside a folder otherwise sounds like it takes them too.
 */
import { useState, useTransition } from "react";
import { deleteDrillGroup, renameDrillGroup } from "@/lib/actions/drills";
import { GROUP_NAME_MAX } from "@/lib/hurling/drill-groups";

export function GroupTools({ id, name, drillCount }: { id: string; name: string; drillCount: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      try {
        await renameDrillGroup(id, draft);
        setError(null);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not rename that group.");
      }
    });

  const remove = () => {
    const kept =
      drillCount === 0
        ? ""
        : ` Its ${drillCount} drill${drillCount === 1 ? " stays" : "s stay"} in your book, just not in a group.`;
    if (!confirm(`Delete the group “${name}”?${kept}`)) return;
    startTransition(() => deleteDrillGroup(id));
  };

  if (editing) {
    return (
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={GROUP_NAME_MAX}
          aria-label="Group name"
          autoFocus
          className="field min-w-0 flex-1"
        />
        <button type="submit" className="btn-primary" disabled={pending || !draft.trim()}>
          Save
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={pending}
          onClick={() => {
            setDraft(name);
            setError(null);
            setEditing(false);
          }}
        >
          Cancel
        </button>
        {error && (
          <p role="alert" className="caption w-full">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 text-[13px]">
      <button type="button" className="btn-ghost" disabled={pending} onClick={() => setEditing(true)}>
        Rename group
      </button>
      <button type="button" className="btn-ghost" disabled={pending} onClick={remove}>
        Delete group
      </button>
    </div>
  );
}
