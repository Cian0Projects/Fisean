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
import { matchDate, fileSize } from "@/lib/format";
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
    <main className="mx-auto max-w-5xl px-4 pt-8 pb-16">
      <header className="border-b pb-5" style={{ borderColor: "var(--color-line-strong)" }}>
        <h1 className="display text-[clamp(2rem,5vw,2.8rem)]">{teamName}</h1>
        <p className="mt-2 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
          {members.length} on the panel, {count(matches.length, "match", "matches")},{" "}
          {count(videos.length, "file", "files")} of footage.
        </p>
      </header>

      {isAdmin && (
        <section className="mt-10">
          <SectionHead
            title="Team code"
            note="Players type this once at /join. Rotating it does not sign anyone out."
          />
          <div className="slab flex flex-wrap items-center gap-5 px-5 py-4">
            <code
              className="tabular text-[2.4rem] leading-none tracking-[0.28em]"
              style={{ color: "var(--color-ash)", fontWeight: 700 }}
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
              Rotate the code
            </button>
          </div>
        </section>
      )}

      <AddMatch />

      <section className="mt-10">
        <SectionHead title="Matches" note="A match can exist before its footage does." />
        {matches.length === 0 ? (
          <Empty>None yet. Add the first one above.</Empty>
        ) : (
          <ul>
            {matches.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <SectionHead
          title="Footage"
          note="Files are registered from the command line, not uploaded through the browser — several gigabytes do not belong in a form post."
        />

        <pre
          className="mb-4 overflow-x-auto rounded px-3 py-2.5 text-[12px]"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            color: "var(--color-ink-dim)",
          }}
        >
          npm run ingest -- &quot;C:\footage\match.mp4&quot; --match &lt;id&gt;
        </pre>

        {videos.length === 0 ? (
          <Empty>Nothing registered yet.</Empty>
        ) : (
          <ul>
            {videos.map((v) => {
              const warning = codecWarning(v.codec);
              return (
                <li key={v.id} className="fixture py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px]">{v.originalFilename}</div>
                      <div
                        className="tabular mt-0.5 text-[12px]"
                        style={{ color: "var(--color-ink-faint)" }}
                      >
                        {formatClock(v.durationMs)}, {fileSize(v.sizeBytes)}
                        {v.codec && `, ${v.codec}`}
                        {v.status !== "ready" && `, ${v.status}`}
                      </div>
                    </div>
                    <Link href={`/review/${v.id}`} className="btn-ghost text-xs">
                      Open
                    </Link>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          if (!confirm(`Delete ${v.originalFilename} and all its clips?`)) return;
                          startTransition(() => void deleteVideo(v.id));
                        }}
                        className="btn-ghost text-xs"
                        style={{ color: "var(--color-danger-ink)" }}
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {warning && (
                    <p
                      className="mt-2 rounded px-3 py-2 text-[13px]"
                      style={{
                        background: "color-mix(in oklab, var(--color-mark) 14%, transparent)",
                      }}
                    >
                      {warning}
                    </p>
                  )}
                  {!v.moovAtStart && (
                    <p className="mt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                      This file stores its index at the end, so the first load takes a
                      moment. Seeking is unaffected once it opens.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="mt-10">
          <SectionHead
            title="The panel"
            note="Removing someone ends their access immediately — sessions are rows, not tokens."
          />
          <ul>
            {members.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === viewer.id} pending={pending} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/** "1 match", "3 matches" — never "1 matches". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-4 border-b pb-2" style={{ borderColor: "var(--color-line-strong)" }}>
      <h2 className="title text-lg">{title}</h2>
      {note && (
        <p className="measure mt-1 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          {note}
        </p>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
      {children}
    </p>
  );
}

/**
 * A match row with a one-click copy of the exact `ingest` command.
 *
 * The match id is a UUID, so showing eight truncated characters was useless
 * for actually running the command — this copies the whole thing, ready to
 * paste, with the file path left as a placeholder.
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
    <li className="fixture flex items-center gap-4 py-3">
      <div className="tabular w-16 shrink-0 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
        {matchDate(match.playedOn)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px]">{match.opponent}</div>
        <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {[match.competition, match.venue].filter(Boolean).join(" at ") || "Friendly"}
        </div>
      </div>
      <Link href={`/matches/${match.id}/stats/log`} className="btn-ghost text-xs">
        Log stats
      </Link>
      <button onClick={() => void copyCommand()} title={match.id} className="btn-ghost text-xs">
        {copied ? "Command copied" : "Copy ingest command"}
      </button>
    </li>
  );
}

function AddMatch() {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-10">
      <div
        className="mb-4 flex items-end justify-between gap-3 border-b pb-2"
        style={{ borderColor: "var(--color-line-strong)" }}
      >
        <div>
          <h2 className="title text-lg">Add a match</h2>
          <p className="mt-1 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            Opponent and date are all it needs to start.
          </p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="btn-outline text-xs">
          {open ? "Cancel" : "New match"}
        </button>
      </div>

      {open && (
        <form
          className="grid gap-4 sm:grid-cols-2"
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
            <label className="label mb-1.5 block">Opponent</label>
            <input name="opponent" required className="field" />
          </div>
          <div>
            <label className="label mb-1.5 block">Date</label>
            <input
              name="playedOn"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="field"
            />
          </div>
          <div>
            <label className="label mb-1.5 block">Competition</label>
            <input name="competition" placeholder="County Senior Championship" className="field" />
          </div>
          <div>
            <label className="label mb-1.5 block">Venue</label>
            <input name="venue" className="field" />
          </div>
          <div>
            <label className="label mb-1.5 block">Half length</label>
            <select name="halfLengthMin" defaultValue={30} className="field">
              <option value={30}>30 minutes — club and underage</option>
              <option value={35}>35 minutes — senior inter-county</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={pending} className="btn-primary w-full">
              {pending ? "Adding…" : "Add the match"}
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
    <li className="fixture flex flex-wrap items-center gap-3 py-2.5">
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
        className="field tabular w-14 px-2 text-center"
        style={{ color: "var(--color-ash)" }}
        aria-label={`Jersey number for ${member.displayName}`}
      />

      <div className="min-w-0 flex-1">
        <div className="text-[15px]">
          {member.displayName}
          {isSelf && (
            <span className="ml-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              you
            </span>
          )}
        </div>
        <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          @{member.username}, {positionLabel(member.position)}
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
        className="field w-44 text-[13px]"
        aria-label={`Position for ${member.displayName}`}
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
        onChange={(e) => startTransition(() => void setMemberRole(member.id, e.target.value as Role))}
        className="field w-28 text-[13px]"
        aria-label={`Role for ${member.displayName}`}
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
          style={{ color: "var(--color-danger-ink)" }}
        >
          Remove
        </button>
      )}
    </li>
  );
}
