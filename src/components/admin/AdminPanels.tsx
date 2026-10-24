"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addTeam,
  deleteMatch,
  deleteVideo,
  moveToTeam,
  removeMember,
  rotateJoinCode,
  setClubCode,
  setMemberEmail,
  setMemberRole,
} from "@/lib/actions/admin";
import { GAME_CODES, GAME_LABELS, isGameCode, type GameCode } from "@/lib/hurling/codes";
import { formatClock } from "@/lib/hurling/notation";
import { codecWarning } from "@/lib/media/probe";
import { matchDate, fileSize } from "@/lib/format";
import { ClubBadge } from "@/components/ui/ClubBadge";
import { BadgeEditor } from "./BadgeEditor";
import { UploadArea, UploadProvider, useUploads } from "./FootageUpload";
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

/** A team in the admin's club, for going to it and moving people onto it. */
type ClubTeam = {
  id: string;
  name: string;
  code: GameCode;
  people: number;
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
 * game, so each match keeps its own number sheet. The team's matches and
 * footage sit in a rail beside it, under the club's teams and the game this
 * one plays. A coach has no panel to manage, so matches take the main column
 * instead, and no list of teams: only an admin goes between them.
 */
export function AdminPanels({
  viewer,
  teamId,
  clubName,
  clubTeams,
  joinCode,
  teamName,
  code,
  badgeVersion,
  members,
  matches,
  videos,
  imports,
}: {
  viewer: { id: string; role: Role };
  teamId: string;
  clubName: string;
  clubTeams: ClubTeam[];
  joinCode: string;
  teamName: string;
  code: GameCode;
  badgeVersion: number | null;
  members: Member[];
  matches: Match[];
  videos: Video[];
  imports: ImportView[];
}) {
  const isAdmin = viewer.role === "admin";
  const otherTeams = clubTeams.filter((t) => t.id !== teamId);

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
                {GAME_LABELS[code]}. {count(members.length, "person", "people")} on the panel,{" "}
                {count(matches.length, "match", "matches")},{" "}
                {count(videos.length, "file", "files")} of footage.
              </p>
            </div>
          </div>
          {/* Keyed by team, so going to another team shows that team's code
              rather than the one held in state from the last. */}
          {isAdmin && <TeamCode key={teamId} initial={joinCode} />}
        </header>

        <div className="mt-12 grid gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <div className="space-y-14">
            {isAdmin ? (
              <Panel members={members} viewerId={viewer.id} otherTeams={otherTeams} />
            ) : (
              <Matches matches={matches} videos={videos} canDelete={false} />
            )}
          </div>

          <aside className="space-y-14">
            {isAdmin && <ClubTeams teams={clubTeams} currentId={teamId} viewerId={viewer.id} />}
            {isAdmin && <GameChoice key={teamId} initial={code} />}
            {isAdmin && <Matches matches={matches} videos={videos} canDelete />}
            <Footage videos={videos} imports={imports} canDelete={isAdmin} />
            {isAdmin && <CloseClub teamName={clubName} />}
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

/**
 * The game the club plays, chosen at sign-up and changeable here. It saves
 * as soon as it is picked, because nothing is lost by it: the same clips and
 * stats simply read in the new code's words, and picking the old game again
 * puts everything back as it was.
 */
function GameChoice({ initial }: { initial: GameCode }) {
  const [code, setCode] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    if (!isGameCode(next) || next === code) return;
    const previous = code;
    setCode(next);
    setNote(null);
    startTransition(async () => {
      const result = await setClubCode(next);
      if ("error" in result) {
        setCode(previous);
        setNote(result.error);
      } else {
        setNote("Saved. The stat sheet and the tags have changed to match.");
      }
    });
  }

  return (
    <section>
      <SectionHead
        title="The game"
        note="Sets the words on the stat sheet and the tags: kick-out or poc amach, 45 or 65, and whether football's two-point arc is drawn. Every clip and stat is kept when it changes. Each team in the club has its own."
      />
      <label htmlFor="club-code" className="sr-only">
        The game this team plays
      </label>
      <select
        id="club-code"
        value={code}
        disabled={pending}
        onChange={(e) => choose(e.target.value)}
        className="field"
      >
        {GAME_CODES.map((c) => (
          <option key={c} value={c}>
            {GAME_LABELS[c]}
          </option>
        ))}
      </select>
      {(pending || note) && (
        <p className="caption mt-2" role="status">
          {pending ? "Saving…" : note}
        </p>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- the teams */

/**
 * The club's teams, for an admin. Each has its own panel, code, footage,
 * clips and drills, and nobody on one sees another's. The admin is on one
 * team at a time like everyone else; going to another moves them onto it,
 * which is why the button says "go" rather than "view".
 */
function ClubTeams({
  teams,
  currentId,
  viewerId,
}: {
  teams: ClubTeam[];
  currentId: string;
  viewerId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go(team: ClubTeam) {
    setError(null);
    startTransition(async () => {
      const result = await moveToTeam(viewerId, team.id);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <section>
      <SectionHead
        title="Teams in the club"
        note="Each team has its own code, matches, clips and drills, and nobody on one can see another's. Only a club admin goes between them or moves someone across."
      />
      <ul>
        {teams.map((t) => (
          <li key={t.id} className="fixture flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{t.name}</div>
              <div className="caption">
                {GAME_LABELS[t.code]}, {count(t.people, "person", "people")}
              </div>
            </div>
            {t.id === currentId ? (
              <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                You are here
              </span>
            ) : (
              <button disabled={pending} onClick={() => go(t)} className="btn-ghost text-xs">
                Go to this team
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
      <AddTeam />
    </section>
  );
}

function AddTeam() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-outline mt-4">
        Add a team
      </button>
    );
  }

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await addTeam({ name, code });
          if ("error" in result) {
            setError(result.error);
          } else {
            setName("");
            setCode("");
            setOpen(false);
          }
        });
      }}
    >
      <div>
        <label htmlFor="new-team-name" className="label mb-1.5 block">
          Team name
        </label>
        <input
          id="new-team-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder="Under 16 camogie"
          className="field"
        />
      </div>
      <div>
        <label htmlFor="new-team-code" className="label mb-1.5 block">
          Game
        </label>
        <select
          id="new-team-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="field"
        >
          <option value="" disabled>
            Choose the game this team plays
          </option>
          {GAME_CODES.map((c) => (
            <option key={c} value={c}>
              {GAME_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <p className="caption">
        It gets its own team code to send its panel. You can also move people onto it from the
        panel on the left.
      </p>
      {error && (
        <p className="text-[12px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Adding…" : "Add the team"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- the panel */

const ROLE_LABEL: Record<Role, string> = {
  admin: "Club admin",
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
function Panel({
  members,
  viewerId,
  otherTeams,
}: {
  members: Member[];
  viewerId: string;
  otherTeams: ClubTeam[];
}) {
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
            <MemberRow key={m.id} member={m} isSelf={m.id === viewerId} otherTeams={otherTeams} />
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

function MemberRow({
  member,
  isSelf,
  otherTeams,
}: {
  member: Member;
  isSelf: boolean;
  otherTeams: ClubTeam[];
}) {
  const [role, setRole] = useState(member.role);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Moving someone takes them off this panel: they see only the new team's
  // matches from then on, so it is asked first, like removing them.
  function move(teamId: string) {
    const team = otherTeams.find((t) => t.id === teamId);
    if (!team) return;
    if (!confirm(`Move ${member.displayName} to ${team.name}? They will see only that team's matches, clips and drills from now on.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await moveToTeam(member.id, team.id);
      if ("error" in result) setError(result.error);
    });
  }

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
        <option value="admin">Club admin</option>
      </select>

      {/* An admin goes to another team from the list of teams, not from
          here, so their own row has no move. */}
      {!isSelf && otherTeams.length > 0 && (
        <select
          value=""
          disabled={pending}
          onChange={(e) => move(e.target.value)}
          className="field w-36 text-[13px]"
          aria-label={`Move ${member.displayName} to another team`}
        >
          <option value="" disabled>
            Move to…
          </option>
          {otherTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

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

/**
 * The matches already made. There is no way to add one here: a match is made
 * by uploading its footage (the Footage panel asks for a title and a date),
 * so there is one place to start and no empty match to wonder about.
 */
function Matches({
  matches,
  videos,
  canDelete,
}: {
  matches: Match[];
  videos: Video[];
  canDelete: boolean;
}) {
  return (
    <section className="@container">
      <SectionHead title="Matches" note="Each match appears here once its footage is uploaded." />

      {matches.length === 0 ? (
        <Empty>None yet. Upload a match file under Footage to add the first one.</Empty>
      ) : (
        <ul>
          {matches.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              footage={videos.filter((v) => v.matchId === m.id)}
              canDelete={canDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A match row: watch it or log its stats.
 *
 * Watch sits on the row itself because the row is where someone who has just
 * uploaded looks for the match; the footage list in the rail is about files,
 * not games.
 */
function MatchRow({
  match,
  footage,
  canDelete,
}: {
  match: Match;
  footage: Video[];
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
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
        {canDelete && (
          <button
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  `Delete the match against ${match.opponent}? Its footage, clips and stats go with it, and cannot be brought back.`,
                )
              )
                return;
              startTransition(() => void deleteMatch(match.id));
            }}
            className="btn-ghost text-xs"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
    </li>
  );
}

/* -------------------------------------------------------------- the club */

/**
 * Closing the club, at the foot of the rail. There is no button: deleting a
 * whole club is the one action with no way back, so an admin asks by email
 * and the host does it with `npm run close-club` once the club has
 * confirmed. The email has to come from an admin's own address, which is how
 * the script finds the club, so the link fills in the rest.
 */
function CloseClub({ teamName }: { teamName: string }) {
  const subject = `Close ${teamName} on Ardawn`;
  const body =
    `Please close ${teamName} on Ardawn and delete everything in it.\n\n` +
    "I am an admin of the club and am sending this from the address I sign in with.";
  const href = `mailto:hello@ardawnsport.ie?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <section>
      <SectionHead title="Close the club" />
      <div className="space-y-3 text-[14px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
        <p>
          Closing the club deletes every team in it, with every match, file of footage, clip, stat,
          drill and person on their panels, and cannot be undone. So that it never happens by accident, it is done by us, not
          from this page.
        </p>
        <p>
          To ask, email us from the address you sign in with. We reply to check it is what the club
          wants, and delete everything within seven days of you confirming. Backups hold a copy for up
          to 30 days, then it is gone for good.
        </p>
        <a href={href} className="btn-outline inline-block">
          Ask to close the club
        </a>
      </div>
    </section>
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
