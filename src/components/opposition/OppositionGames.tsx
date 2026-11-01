"use client";

/**
 * A club's games, ours against them and theirs brought in for analysis, as a
 * fixture list. Coaches upload footage to a game from here; an admin can
 * delete an opposition game, which takes its footage and clips with it.
 * Our own games are deleted where they always were, on the squad page.
 */
import Link from "next/link";
import { useTransition } from "react";
import { deleteMatch } from "@/lib/actions/admin";
import { matchDate } from "@/lib/format";
import type { OppositionGame } from "@/lib/queries/opposition";
import { UploadButton, UploadList, UploadProvider } from "@/components/admin/FootageUpload";

export function OppositionGames({
  name,
  games,
  canUpload,
  canDelete,
}: {
  name: string;
  games: OppositionGame[];
  canUpload: boolean;
  canDelete: boolean;
}) {
  return (
    <UploadProvider pageDrop={false}>
      <UploadList />
      <ul>
        {games.map((g) => (
          <GameRow key={g.id} name={name} game={g} canUpload={canUpload} canDelete={canDelete} />
        ))}
      </ul>
    </UploadProvider>
  );
}

function GameRow({
  name,
  game,
  canUpload,
  canDelete,
}: {
  name: string;
  game: OppositionGame;
  canUpload: boolean;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const ours = game.kind === "ours";
  const what = ours ? `${name} v us` : `${name} v ${game.vsName ?? "another team"}`;
  const where = [game.competition, ours ? "played against us" : "for analysis"].filter(Boolean).join(", ");

  return (
    <li className="fixture flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <div
        className="tabular w-[4.5rem] shrink-0 whitespace-nowrap text-[13px]"
        style={{ color: "var(--color-ink-faint)" }}
      >
        {matchDate(game.playedOn)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">
          {ours || !game.vsId ? (
            what
          ) : (
            <>
              {name} v{" "}
              <Link href={`/opposition/${game.vsId}`} className="hover:underline">
                {game.vsName}
              </Link>
            </>
          )}
        </div>
        <div className="caption truncate">
          {game.arriving ? `${where}, video uploading` : game.videoId ? where : `${where}, no footage yet`}
        </div>
      </div>
      <div className="flex justify-end gap-1">
        {game.videoId && (
          <Link href={`/review/${game.videoId}`} className="btn-ghost text-xs">
            Watch
          </Link>
        )}
        {canUpload && !game.videoId && !game.arriving && (
          <UploadButton matchId={game.id} className="btn-ghost text-xs">
            Upload footage
          </UploadButton>
        )}
        {canDelete && !ours && (
          <button
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete ${what}? Its footage, clips and stats go with it, and cannot be brought back.`)) {
                return;
              }
              startTransition(() => void deleteMatch(game.id));
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
