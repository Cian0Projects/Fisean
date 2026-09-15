"use client";

import Link from "next/link";

import { useState, useTransition } from "react";
import {
  createMatch,
  deleteVideo,
  removeMember,
  rotateJoinCode,
  setMemberRole,
  updateMember,
} from "@/lib/actions/admin";
import { formatClock } from "@/lib/hurling/notation";
import { POSITIONS, positionLabel } from "@/lib/hurling/positions";
import { codecWarning } from "@/lib/media/probe";
import type { Role } from "@/lib/db/schema";

type Member = {
  id: string;
  displayName: string;
  username: string;
  role: Role;
  jerseyNumber: number | null;
  position: number | null;
  lastSeenAt: number | null;
};

type Match = {
  id: string;
  opponent: string;
  competition: string | null;
  playedOn: string;
  venue: string | null;
};

type Video = {
  id: string;
  originalFilename: string;
  durationMs: number;
  sizeBytes: number;
  status: string;
  matchId: string | null;
  codec: string | null;
  moovAtStart: boolean;
};

export function AdminPanels({
  viewer,
  joinCode,
  teamName,
  members,
  matches,
  videos,
}: {
  viewer: { id: string; role: Role };
  joinCode: string;
  teamName: string;
  members: Member[];
  matches: Match[];
  videos: Video[];
}) {
  const [code, setCode] = useState(joinCode);
  const [pending, startTransition] = useTransition();
  const isAdmin = viewer.role === "admin";

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-8">
      {isAdmin && (
        <section className="card p-5">
          <h2 className="mb-1 text-base font-semibold">Join code</h2>
          <p className="mb-4 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
            Players enter this once at <code>/join</code> to get on the panel.
            Rotate it if it has travelled beyond the squad — existing accounts
            keep working.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <code
              className="tabular rounded-lg px-4 py-2.5 text-2xl font-semibold tracking-[0.3em]"
              style={{ background: "var(--color-stage)", color: "var(--color-brand)" }}
            >
              {code}
            </code>
            <button
              onClick={() =>
                startTransition(async () => {
                  const { joinCode: next } = await rotateJoinCode();
                  setCode(next);
                })
              }
              className="btn-outline text-xs"
            >
              Rotate
            </button>
            <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {teamName}
            </span>
          </div>
        </section>
      )}

      <AddMatch />

      <section>
        <h2 className="mb-3 text-base font-semibold">Matches</h2>
        {matches.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            None yet.
          </p>
        ) : (
          <div className="space-y-2">
            {matches.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">Footage</h2>
        <p className="mb-3 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
          Drop the match file into <code>data/media/</code> and register it with{" "}
          <code>npm run ingest -- &lt;file&gt; --match &lt;id&gt;</code>. That
          avoids pushing several gigabytes through a browser.
        </p>
        {videos.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            No footage yet.
          </p>
        ) : (
          <div className="space-y-2">
            {videos.map((v) => {
              const warning = codecWarning(v.codec);
              return (
                <div key={v.id} className="card p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{v.originalFilename}</div>
                      <div
                        className="tabular text-[11px]"
                        style={{ color: "var(--color-ink-faint)" }}
                      >
                        {formatClock(v.durationMs)} ·{" "}
                        {(v.sizeBytes / 1024 ** 3).toFixed(2)} GB · {v.status}
                        {v.codec && ` · ${v.codec}`}
                      </div>
                    </div>
                    <Link href={`/review/${v.id}`} className="btn-outline text-xs">
                      Review
                    </Link>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          if (!confirm(`Delete ${v.originalFilename} and all its clips?`)) return;
                          startTransition(() => void deleteVideo(v.id));
                        }}
                        className="btn-ghost text-xs"
                        style={{ color: "var(--color-danger)" }}
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {warning && (
                    <p
                      className="mt-2 rounded px-2 py-1.5 text-[12px]"
                      style={{
                        background: "color-mix(in oklab, var(--color-mark) 16%, transparent)",
                      }}
                    >
                      {warning}
                    </p>
                  )}
                  {!v.moovAtStart && (
                    <p className="mt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                      This file stores its index at the end, so the first load takes
                      a moment. Seeking is unaffected once it opens.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isAdmin && (
        <section>
          <h2 className="mb-3 text-base font-semibold">Panel ({members.length})</h2>
          <div className="space-y-2">
            {members.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === viewer.id} pending={pending} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

/**
 * A match row with a one-click copy of the exact `ingest` command.
 *
 * The match id is a UUID, so showing eight truncated characters was useless
 * for actually running `npm run ingest -- <file> --match <id>` — this copies
 * the whole command, ready to paste, with the file path left as a placeholder.
 */
function MatchRow({ match }: { match: Match }) {
  const [copied, setCopied] = useState(false);

  const copyCommand = async () => {
    const command = `npm run ingest -- "path\\to\\match.mp4" --match ${match.id}`;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be blocked (no HTTPS, no permission); the id is
      // still visible in the title attribute as a fallback.
    }
  };

  return (
    <div className="card flex items-center gap-3 p-3">
      <div className="flex-1">
        <div className="text-sm font-medium">{match.opponent}</div>
        <div className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
          {match.playedOn}
          {match.competition && ` · ${match.competition}`}
          {match.venue && ` · ${match.venue}`}
        </div>
      </div>
      <button
        onClick={() => void copyCommand()}
        title={match.id}
        className="btn-ghost text-[11px]"
      >
        {copied ? "Copied ingest command" : "Copy ingest command"}
      </button>
    </div>
  );
}

function AddMatch() {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Add a match</h2>
        <button onClick={() => setOpen((v) => !v)} className="btn-ghost text-xs">
          {open ? "Cancel" : "New match"}
        </button>
      </div>

      {open && (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          action={(form) =>
            startTransition(async () => {
              await createMatch({
                opponent: String(form.get("opponent")),
                playedOn: String(form.get("playedOn")),
                competition: String(form.get("competition") || ""),
                venue: String(form.get("venue") || ""),
                halfLengthMin: Number(form.get("halfLengthMin") || 30),
              });
              setOpen(false);
            })
          }
        >
          <div>
            <label className="label mb-1 block">Opponent</label>
            <input name="opponent" required className="field" />
          </div>
          <div>
            <label className="label mb-1 block">Date</label>
            <input
              name="playedOn"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="field"
            />
          </div>
          <div>
            <label className="label mb-1 block">Competition</label>
            <input name="competition" placeholder="County Senior Championship" className="field" />
          </div>
          <div>
            <label className="label mb-1 block">Venue</label>
            <input name="venue" className="field" />
          </div>
          <div>
            <label className="label mb-1 block">Half length</label>
            <select name="halfLengthMin" defaultValue={30} className="field">
              <option value={30}>30 minutes — club and underage</option>
              <option value={35}>35 minutes — senior inter-county</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={pending} className="btn-primary w-full">
              {pending ? "Adding…" : "Add match"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function MemberRow({
  member,
  isSelf,
  pending,
}: {
  member: Member;
  isSelf: boolean;
  pending: boolean;
}) {
  const [, startTransition] = useTransition();

  return (
    <div className="card flex flex-wrap items-center gap-3 p-3">
      <input
        type="number"
        defaultValue={member.jerseyNumber ?? ""}
        onBlur={(e) =>
          startTransition(() =>
            void updateMember(member.id, {
              jerseyNumber: e.target.value ? Number(e.target.value) : null,
            }),
          )
        }
        className="field tabular w-14 text-center"
        aria-label="Jersey number"
      />

      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {member.displayName}
          {isSelf && (
            <span className="ml-2 text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
              you
            </span>
          )}
        </div>
        <div className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
          @{member.username} · {positionLabel(member.position)}
        </div>
      </div>

      <select
        defaultValue={member.position ?? ""}
        onChange={(e) =>
          startTransition(() =>
            void updateMember(member.id, {
              position: e.target.value ? Number(e.target.value) : null,
            }),
          )
        }
        className="field w-44 text-xs"
        aria-label="Position"
      >
        <option value="">No position</option>
        {POSITIONS.map((p) => (
          <option key={p.number} value={p.number}>
            {p.number} · {p.name}
          </option>
        ))}
      </select>

      <select
        defaultValue={member.role}
        disabled={pending}
        onChange={(e) =>
          startTransition(() => void setMemberRole(member.id, e.target.value as Role))
        }
        className="field w-28 text-xs"
        aria-label="Role"
      >
        <option value="player">Player</option>
        <option value="coach">Coach</option>
        <option value="admin">Admin</option>
      </select>

      {!isSelf && (
        <button
          onClick={() => {
            if (!confirm(`Remove ${member.displayName} from the panel?`)) return;
            startTransition(() => void removeMember(member.id));
          }}
          className="btn-ghost text-xs"
          style={{ color: "var(--color-danger)" }}
        >
          Remove
        </button>
      )}
    </div>
  );
}
