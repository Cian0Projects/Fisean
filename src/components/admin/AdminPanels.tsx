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
import { LINE_LABELS, POSITIONS, type Line } from "@/lib/hurling/positions";
import { codecWarning } from "@/lib/media/probe";
import { matchDate, fileSize } from "@/lib/format";
import type { Role } from "@/lib/db/schema";

type Member = {
  id: string;
  displayName: string;
  username: string;
  role: Role;
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

/**
 * The squad page.
 *
 * For an admin it leads with the panel as a team sheet — the fifteen read
 * out line by line, the way the page is printed on a match programme — with
 * the editing table under it and the club's matches and footage in a rail.
 * A coach has no panel to manage, so matches take the main column instead.
 */
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
  const isAdmin = viewer.role === "admin";

  return (
    <main className="sheet pt-10 pb-20 lg:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
        <div>
          <h1 className="display text-[clamp(2.75rem,6vw,4.5rem)]">{teamName}</h1>
          <p className="mt-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            {count(members.length, "person", "people")} on the panel,{" "}
            {count(matches.length, "match", "matches")},{" "}
            {count(videos.length, "file", "files")} of footage.
          </p>
        </div>
        {isAdmin && <TeamCode initial={joinCode} />}
      </header>

      <div className="mt-12 grid gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="space-y-14">
          {isAdmin ? (
            <>
              <TeamSheet members={members} />
              <PanelEditor members={members} viewerId={viewer.id} />
            </>
          ) : (
            <Matches matches={matches} />
          )}
        </div>

        <aside className="space-y-14">
          {isAdmin && <Matches matches={matches} />}
          <Footage videos={videos} canDelete={isAdmin} />
        </aside>
      </div>
    </main>
  );
}

/** "1 match", "3 matches" — never "1 matches". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function SectionHead({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-head mb-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="title text-xl">{title}</h2>
        {action}
      </div>
      {note && <p className="caption measure mt-1">{note}</p>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-4 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
      {children}
    </p>
  );
}

/**
 * The join code, one character to a box like a ticket's serial number, so
 * it can be read aloud across a dressing room without an O becoming a 0.
 */
function TeamCode({ initial }: { initial: string }) {
  const [code, setCode] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <p className="text-[13px] font-semibold">Team code</p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <code className="flex gap-1" aria-label={`Team code ${code.split("").join(" ")}`}>
          {code.split("").map((ch, i) => (
            <span
              key={i}
              aria-hidden
              className="figure flex h-12 w-10 items-center justify-center border-[1.5px] text-[1.6rem]"
              style={{ borderColor: "var(--color-ash)", color: "var(--color-ash)", borderRadius: 2 }}
            >
              {ch}
            </span>
          ))}
        </code>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const { joinCode: next } = await rotateJoinCode();
              setCode(next);
            })
          }
          className="btn-outline"
        >
          {pending ? "Rotating…" : "Rotate the code"}
        </button>
      </div>
      <p className="caption mt-2">
        Players type this once at /join. Rotating it does not sign anyone out.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ team sheet */

const LINES: Line[] = [
  "goalkeeper",
  "full_back",
  "half_back",
  "midfield",
  "half_forward",
  "full_forward",
];

/**
 * The fifteen, read the way a team sheet prints them: goalkeeper at the top,
 * each line across the page beneath, and the position number boxed where a
 * jersey number would be. Two players can hold one position — it is a
 * squad, not a starting fifteen — so a slot lists everyone in it. An empty
 * slot stays on the sheet, dashed, because a gap in the half-back line is
 * worth seeing.
 */
function TeamSheet({ members }: { members: Member[] }) {
  const byPosition = new Map<number, Member[]>();
  for (const m of members) {
    if (m.position == null) continue;
    byPosition.set(m.position, [...(byPosition.get(m.position) ?? []), m]);
  }
  const subs = members.filter((m) => m.position == null && m.role === "player");
  const management = members.filter((m) => m.position == null && m.role !== "player");

  return (
    <section>
      <SectionHead
        title="The team sheet"
        note="Everyone with a position, in their line. Set positions in the panel below."
      />

      <div>
        {LINES.map((line) => {
          const slots = POSITIONS.filter((p) => p.line === line);
          return (
            <div
              key={line}
              className="grid items-start gap-x-6 gap-y-3 border-b py-5 sm:grid-cols-[8.5rem_minmax(0,1fr)]"
              style={{ borderColor: "var(--color-line)" }}
            >
              <p className="caption pt-1.5">{LINE_LABELS[line]}</p>
              {/*
                Six columns, each slot two wide: a line of three fills the row,
                the midfield pair sits in the middle four, and the goalkeeper
                in the middle two — the shape of a team sheet, not a grid. The
                shape holds on a phone too; the slots stack number over name.
              */}
              <ol className="grid grid-cols-6 gap-x-2 gap-y-4 sm:gap-x-4">
                {slots.map((p, i) => (
                  <Slot
                    key={p.number}
                    number={p.number}
                    name={p.name}
                    people={byPosition.get(p.number) ?? []}
                    start={slots.length === 1 ? 3 : slots.length === 2 ? 2 + i * 2 : 1 + i * 2}
                  />
                ))}
              </ol>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <h3 className="title text-base">Subs and the rest of the panel</h3>
          {subs.length === 0 ? (
            <p className="caption mt-2">Nobody here yet: every player on the panel has a position.</p>
          ) : (
            <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {subs.map((m) => (
                <li key={m.id} className="truncate text-[14px]">
                  {m.displayName}
                </li>
              ))}
            </ul>
          )}
        </div>
        {management.length > 0 && (
          <div>
            <h3 className="title text-base">Management</h3>
            <ul className="mt-3 space-y-2">
              {management.map((m) => (
                <li key={m.id} className="text-[14px]">
                  {m.displayName}
                  <span className="caption ml-2">{m.role === "admin" ? "Team admin" : "Coach"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// Spelled out so Tailwind sees each class whole, never built from a number.
const SLOT_START: Record<number, string> = {
  1: "col-start-1",
  2: "col-start-2",
  3: "col-start-3",
  4: "col-start-4",
  5: "col-start-5",
};

function Slot({
  number,
  name,
  people,
  start,
}: {
  number: number;
  name: string;
  people: Member[];
  /** Which of the sheet's six columns the slot starts in, on a wide screen. */
  start: number;
}) {
  const empty = people.length === 0;
  return (
    <li
      className={`col-span-2 flex flex-col items-center gap-1.5 text-center sm:flex-row sm:items-start sm:gap-3 sm:text-left ${SLOT_START[start]}`}
    >
      <span
        className="figure flex h-9 min-w-9 shrink-0 items-center justify-center text-[1.1rem]"
        style={{
          border: `1.5px ${empty ? "dashed" : "solid"} var(--color-ash)`,
          color: empty ? "var(--color-ash-dim)" : "var(--color-ash)",
          borderRadius: 2,
        }}
      >
        {number}
      </span>
      <div className="min-w-0 pt-0.5">
        {empty ? (
          <p className="text-[13px] sm:text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
            Unfilled
          </p>
        ) : (
          people.map((m) => (
            <p key={m.id} className="text-[13px] font-semibold leading-snug sm:truncate sm:text-[15px]">
              {m.displayName}
            </p>
          ))
        )}
        <p className="caption hidden truncate sm:block">{name}</p>
      </div>
    </li>
  );
}

/* --------------------------------------------------------------- the panel */

/**
 * Editing the panel. A table because every row asks the same four things —
 * number, position, role, keep or remove — and the columns are what let the
 * eye run down one of them.
 */
function PanelEditor({ members, viewerId }: { members: Member[]; viewerId: string }) {
  const [pending] = useTransition();

  return (
    <section>
      <SectionHead
        title="The panel"
        note="Removing someone ends their access immediately — sessions are rows, not tokens."
      />
      <div
        className="caption hidden items-center gap-3 border-b pb-2 sm:flex"
        style={{ borderColor: "var(--color-line)" }}
        aria-hidden
      >
        <span className="w-14 text-center">No.</span>
        <span className="flex-1">Name</span>
        <span className="w-44">Position</span>
        <span className="w-28">Role</span>
        <span className="w-20" />
      </div>
      <ul>
        {members.map((m) => (
          <MemberRow key={m.id} member={m} isSelf={m.id === viewerId} pending={pending} />
        ))}
      </ul>
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
      {/* No jersey number: those change game to game, so each match keeps its own. */}
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">
          {member.displayName}
          {isSelf && (
            <span className="ml-2 text-[12px] font-normal" style={{ color: "var(--color-ink-faint)" }}>
              you
            </span>
          )}
        </div>
        <div className="caption">@{member.username}</div>
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
            {p.number}, {p.name}
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

      <div className="flex w-20 justify-end">
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
      </div>
    </li>
  );
}

/* ------------------------------------------------------- matches, footage */

function Matches({ matches }: { matches: Match[] }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="@container">
      <SectionHead
        title="Matches"
        note="A match can exist before its footage does. Opponent and date are all it needs."
        action={
          <button onClick={() => setOpen((v) => !v)} className={open ? "btn-ghost" : "btn-primary"}>
            {open ? "Cancel" : "New match"}
          </button>
        }
      />

      {open && <AddMatch onDone={() => setOpen(false)} />}

      {matches.length === 0 ? (
        <Empty>None yet. Add the first one with New match.</Empty>
      ) : (
        <ul>
          {matches.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </ul>
      )}
    </section>
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
    <li className="fixture flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <div
        className="tabular w-[4.5rem] shrink-0 whitespace-nowrap text-[13px]"
        style={{ color: "var(--color-ink-faint)" }}
      >
        {matchDate(match.playedOn)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{match.opponent}</div>
        <div className="caption truncate">
          {[match.competition, match.venue].filter(Boolean).join(" at ") || "Friendly"}
        </div>
      </div>
      <div className="flex w-full justify-end gap-1 @lg:w-auto">
        <Link href={`/matches/${match.id}/stats/log`} className="btn-ghost text-xs">
          Log stats
        </Link>
        <button onClick={() => void copyCommand()} title={match.id} className="btn-ghost text-xs">
          {copied ? "Command copied" : "Copy ingest command"}
        </button>
      </div>
    </li>
  );
}

function AddMatch({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mb-6 grid gap-4 border-b pb-6 @md:grid-cols-2"
      style={{ borderColor: "var(--color-line)" }}
      action={(form) =>
        startTransition(async () => {
          await createMatch({
            opponent: String(form.get("opponent")),
            playedOn: String(form.get("playedOn")),
            competition: String(form.get("competition") || ""),
            venue: String(form.get("venue") || ""),
            halfLengthMin: Number(form.get("halfLengthMin") || 30),
          });
          onDone();
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
  );
}

function Footage({ videos, canDelete }: { videos: Video[]; canDelete: boolean }) {
  const [, startTransition] = useTransition();

  return (
    <section>
      <SectionHead
        title="Footage"
        note="Registered from the command line, not uploaded through the browser — several gigabytes do not belong in a form post."
      />

      <pre
        className="mb-4 overflow-x-auto px-3 py-2.5 text-[12px]"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-line)",
          borderRadius: 2,
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
                    <div className="truncate text-[15px] font-semibold">{v.originalFilename}</div>
                    <div className="caption tabular mt-0.5">
                      {formatClock(v.durationMs)}, {fileSize(v.sizeBytes)}
                      {v.codec && `, ${v.codec}`}
                      {v.status !== "ready" && `, ${v.status}`}
                    </div>
                  </div>
                  <Link href={`/review/${v.id}`} className="btn-ghost text-xs">
                    Open
                  </Link>
                  {canDelete && (
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
                    className="mt-2 px-3 py-2 text-[13px]"
                    style={{
                      background: "color-mix(in oklab, var(--color-mark) 12%, transparent)",
                      borderRadius: 2,
                    }}
                  >
                    {warning}
                  </p>
                )}
                {!v.moovAtStart && (
                  <p className="caption mt-2">
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
  );
}
