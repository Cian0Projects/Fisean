"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  createMatch,
  deleteVideo,
  removeMember,
  rotateJoinCode,
  setMemberEmail,
  setMemberRole,
} from "@/lib/actions/admin";
import { formatClock } from "@/lib/hurling/notation";
import { codecWarning } from "@/lib/media/probe";
import { matchDate, fileSize } from "@/lib/format";
import { ClubBadge } from "@/components/ui/ClubBadge";
import { BadgeEditor } from "./BadgeEditor";
import { UploadArea, UploadButton, UploadProvider, useUploads } from "./FootageUpload";
import { FootageImport } from "./FootageImport";
import type { Role } from "@/lib/db/schema";
import type { ImportView } from "@/lib/queries/imports";

type Member = {
  id: string;
  displayName: string;
  email: string | null;
  role: Role;
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
 * For an admin it leads with the panel: everyone at the club in one list,
 * each name flagged player, coach or admin, and the admin alone deciding
 * which. Numbers and positions stay off it on purpose. They change game to
 * game, so each match keeps its own number sheet. The club's matches and
 * footage sit in a rail beside it. A coach has no panel to manage, so
 * matches take the main column instead.
 */
export function AdminPanels({
  viewer,
  joinCode,
  teamName,
  badgeVersion,
  members,
  matches,
  videos,
  imports,
}: {
  viewer: { id: string; role: Role };
  joinCode: string;
  teamName: string;
  badgeVersion: number | null;
  members: Member[];
  matches: Match[];
  videos: Video[];
  imports: ImportView[];
}) {
  const isAdmin = viewer.role === "admin";

  return (
    <UploadProvider>
      <main className="sheet pt-10 pb-20 lg:pt-14">
        <header className="flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
          <div className="flex items-end gap-5">
            {/* Only the admin changes the badge; everyone else just sees it. */}
            {isAdmin ? (
              <BadgeEditor initial={badgeVersion} />
            ) : (
              <ClubBadge version={badgeVersion} className="h-20 w-20" />
            )}
            <div>
              <h1 className="display text-[clamp(2.75rem,6vw,4.5rem)]">{teamName}</h1>
              <p className="mt-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                {count(members.length, "person", "people")} on the panel,{" "}
                {count(matches.length, "match", "matches")},{" "}
                {count(videos.length, "file", "files")} of footage.
              </p>
            </div>
          </div>
          {isAdmin && <TeamCode initial={joinCode} />}
        </header>

        <div className="mt-12 grid gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <div className="space-y-14">
            {isAdmin ? (
              <Panel members={members} viewerId={viewer.id} />
            ) : (
              <Matches matches={matches} videos={videos} />
            )}
          </div>

          <aside className="space-y-14">
            {isAdmin && <Matches matches={matches} videos={videos} />}
            <Footage videos={videos} imports={imports} canDelete={isAdmin} />
          </aside>
        </div>
      </main>
    </UploadProvider>
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

/* --------------------------------------------------------------- the panel */

const ROLE_LABEL: Record<Role, string> = {
  admin: "Team admin",
  coach: "Coach",
  player: "Player",
};

// Management reads first, then the players, each alphabetical: the order a
// club secretary would read the list out in.
const ROLE_ORDER: Record<Role, number> = { admin: 0, coach: 1, player: 2 };

/**
 * Everyone at the club, one row each: the name, a flag saying what they are,
 * and for the admin a choice of what they should be. Sorted by the role they
 * arrived with, so a row stays put while its role is being changed.
 */
function Panel({ members, viewerId }: { members: Member[]; viewerId: string }) {
  const sorted = [...members].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.displayName.localeCompare(b.displayName),
  );

  return (
    <section>
      <SectionHead
        title="The panel"
        note="Everyone who has joined with the team code. You decide who is a player and who is a coach. Removing someone signs them out straight away."
      />
      {sorted.length === 0 ? (
        <Empty>Nobody yet. Send the panel the team code; they sign up at /join.</Empty>
      ) : (
        <ul>
          {sorted.map((m) => (
            <MemberRow key={m.id} member={m} isSelf={m.id === viewerId} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The flag beside a name. Bordered ink, never coloured, because colour in
 * this app means an outcome on the field, and being a coach is not one. The
 * admin's flag is filled so it still stands out on a photocopy.
 */
function RoleFlag({ role }: { role: Role }) {
  const admin = role === "admin";
  return (
    <span
      className="inline-block whitespace-nowrap px-1.5 py-px align-middle text-[11px] font-semibold"
      style={{
        border: "1px solid var(--color-line-strong)",
        borderRadius: 2,
        background: admin ? "var(--color-ink)" : "transparent",
        color: admin ? "var(--color-stage)" : "var(--color-ink-dim)",
      }}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

function MemberRow({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const [role, setRole] = useState(member.role);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeRole(next: Role) {
    const before = role;
    setRole(next);
    setError(null);
    startTransition(async () => {
      const result = await setMemberRole(member.id, next);
      if ("error" in result) {
        setRole(before);
        setError(result.error);
      }
    });
  }

  return (
    <li className="fixture flex flex-wrap items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-semibold">{member.displayName}</span>
          <RoleFlag role={role} />
          {isSelf && (
            <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              you
            </span>
          )}
        </div>
        {member.email ? <div className="caption">{member.email}</div> : <AddEmail member={member} />}
        {error && (
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-danger-ink)" }}>
            {error}
          </p>
        )}
      </div>

      <select
        value={role}
        disabled={pending}
        onChange={(e) => changeRole(e.target.value as Role)}
        className="field w-32 text-[13px]"
        aria-label={`Role for ${member.displayName}`}
      >
        <option value="player">Player</option>
        <option value="coach">Coach</option>
        <option value="admin">Team admin</option>
      </select>

      <div className="flex w-20 justify-end">
        {!isSelf && (
          <button
            onClick={() => {
              if (!confirm(`Remove ${member.displayName} from the panel?`)) return;
              startTransition(() => void removeMember(member.id));
            }}
            className="btn-ghost text-xs"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * For someone who joined before sign-in moved to email. Without an email they
 * cannot sign in again once their session ends, so the admin can fill the
 * blank. Only a blank: an email already set is theirs to change, not ours.
 */
function AddEmail({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div className="caption">
        No email yet, so they cannot sign in.{" "}
        <button onClick={() => setOpen(true)} className="underline underline-offset-2">
          Add one
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setMemberEmail(member.id, value);
          if ("error" in result) setError(result.error);
        });
      }}
    >
      <input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        autoCapitalize="none"
        placeholder={`${member.displayName.split(" ")[0]}'s email`}
        aria-label={`Email for ${member.displayName}`}
        className="field w-56 text-[13px]"
      />
      <button type="submit" disabled={pending} className="btn-ghost text-xs">
        Save
      </button>
      {error && (
        <span className="text-[12px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </span>
      )}
    </form>
  );
}

/* ------------------------------------------------------- matches, footage */

function Matches({ matches, videos }: { matches: Match[]; videos: Video[] }) {
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
            <MatchRow
              key={m.id}
              match={m}
              footage={videos.filter((v) => v.matchId === m.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A match row: watch it, log its stats, or add a video to it. Uploading files
 * the video straight against this match without asking which one it is.
 *
 * Watch sits on the row itself because the row is where someone who has just
 * uploaded looks for the match; the footage list in the rail is about files,
 * not games.
 */
function MatchRow({ match, footage }: { match: Match; footage: Video[] }) {
  const ready = footage.find((v) => v.status === "ready");
  const arriving = !ready && footage.some((v) => v.status === "uploading");
  const where = [match.competition, match.venue].filter(Boolean).join(" at ") || "Friendly";

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
          {arriving ? `${where}, video uploading` : where}
        </div>
      </div>
      <div className="flex w-full justify-end gap-1 @lg:w-auto">
        {ready && (
          <Link href={`/review/${ready.id}`} className="btn-ghost text-xs">
            Watch
          </Link>
        )}
        <Link href={`/matches/${match.id}/stats/log`} className="btn-ghost text-xs">
          Log stats
        </Link>
        <UploadButton matchId={match.id} className="btn-ghost text-xs">
          Upload video
        </UploadButton>
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
          <option value={30}>30 minutes, club and underage</option>
          <option value={35}>35 minutes, senior inter-county</option>
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

function Footage({
  videos,
  imports,
  canDelete,
}: {
  videos: Video[];
  imports: ImportView[];
  canDelete: boolean;
}) {
  const [, startTransition] = useTransition();
  const { uploads } = useUploads();
  // A file on its way up is shown in the upload queue, and one coming across
  // from another app in the import list, each with its progress; listing its
  // half-written row here as well would show it twice.
  const inFlight = new Set([...uploads.map((u) => u.videoId), ...imports.map((i) => i.videoId)]);
  const listed = videos.filter((v) => !inFlight.has(v.id));

  return (
    <section>
      <SectionHead
        title="Footage"
        note="Everyone on the panel can watch what goes up here. A full match can take a while on club WiFi; if it stops, drop the same file again and it carries on from where it was."
      />

      <UploadArea />
      <FootageImport initial={imports} />

      {listed.length === 0 ? (
        <Empty>No footage yet.</Empty>
      ) : (
        <ul>
          {listed.map((v) => {
            const warning = codecWarning(v.codec);
            return (
              <li key={v.id} className="fixture py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{v.originalFilename}</div>
                    <div className="caption tabular mt-0.5">
                      {v.status === "uploading"
                        ? `${fileSize(v.sizeBytes)}, stopped part-way. Drop the same file again to finish it.`
                        : `${formatClock(v.durationMs)}, ${fileSize(v.sizeBytes)}${v.status !== "ready" ? `, ${v.status}` : ""}`}
                    </div>
                  </div>
                  {v.status === "ready" && (
                    <Link href={`/review/${v.id}`} className="btn-ghost text-xs">
                      Open
                    </Link>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => {
                        if (!confirm(`Delete ${v.originalFilename} and all its clips?`)) return;
                        startTransition(() => void deleteVideo(v.id));
                      }}
                      className="btn-ghost text-xs"
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
