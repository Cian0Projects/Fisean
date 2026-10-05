import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, playlistItems, playlistViewers, playlists, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { formatClock } from "@/lib/hurling/notation";

/** How much of the running order to print before "and n more". */
const PREVIEW = 4;

export default async function PlaylistsPage() {
  const user = await requireUser();

  const rows = await db
    .select({
      id: playlists.id,
      title: playlists.title,
      description: playlists.description,
      isOfficial: playlists.isOfficial,
      authorName: users.displayName,
    })
    .from(playlists)
    .leftJoin(users, eq(users.id, playlists.createdBy))
    .where(eq(playlists.teamId, user.teamId))
    .orderBy(desc(playlists.isOfficial), desc(playlists.createdAt));

  const ids = rows.map((r) => r.id);

  // Every item on every playlist, in order: the preview, the clip count and
  // the running time all come from the one list.
  const itemRows = ids.length
    ? await db
        .select({
          playlistId: playlistItems.playlistId,
          title: clips.title,
          startMs: clips.startMs,
          endMs: clips.endMs,
        })
        .from(playlistItems)
        .innerJoin(clips, eq(clips.id, playlistItems.clipId))
        .where(inArray(playlistItems.playlistId, ids))
        .orderBy(asc(playlistItems.playlistId), asc(playlistItems.sortOrder))
    : [];

  // Who a playlist was set for, and which of them have opened it. The count
  // is for everyone; the names of those still to watch are for the coaches,
  // because following them up is the coaches' job.
  const viewerRows = ids.length
    ? await db
        .select({
          playlistId: playlistViewers.playlistId,
          name: users.displayName,
          viewedAt: playlistViewers.viewedAt,
        })
        .from(playlistViewers)
        .innerJoin(users, eq(users.id, playlistViewers.userId))
        .where(inArray(playlistViewers.playlistId, ids))
        .orderBy(asc(users.displayName))
    : [];

  const itemsBy = new Map<string, Item[]>();
  for (const i of itemRows) {
    itemsBy.set(i.playlistId, [...(itemsBy.get(i.playlistId) ?? []), i]);
  }
  const viewersBy = new Map<string, typeof viewerRows>();
  for (const v of viewerRows) {
    viewersBy.set(v.playlistId, [...(viewersBy.get(v.playlistId) ?? []), v]);
  }
  const isCoach = user.role !== "player";

  const entries: Entry[] = rows.map((r) => {
    const viewers = viewersBy.get(r.id) ?? [];
    return {
      ...r,
      items: itemsBy.get(r.id) ?? [],
      assigned: viewers.length,
      watched: viewers.filter((v) => v.viewedAt != null).length,
      stillToWatch: isCoach ? viewers.filter((v) => v.viewedAt == null).map((v) => v.name) : [],
    };
  });

  const official = entries.filter((r) => r.isOfficial);
  const personal = entries.filter((r) => !r.isOfficial);

  return (
    <>
      <Nav user={user} />

      <main className="sheet pt-10 pb-20 lg:pt-14">
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <header className="lg:sticky lg:top-24 lg:self-start">
            <h1 className="display text-[clamp(2.75rem,5vw,3.75rem)]">Playlists</h1>
            <p className="mt-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
              A run of clips in the order you want them watched.
            </p>
            <p className="caption mt-3 max-w-[30ch]">
              Build one from the review screen: select a clip and add it from the
              details panel.
            </p>

            <p
              className="mt-6 hidden border-t pt-4 text-[13px] lg:block"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-dim)" }}
            >
              {official.length} set by the coaches, {personal.length} made by the panel.
            </p>
          </header>

          {entries.length === 0 ? (
            <div className="section-head">
              <p className="py-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                None yet. The first one takes about a minute: open a match, pick
                the clips, and add them in the order you want them watched.
              </p>
            </div>
          ) : (
            <div className="space-y-16">
              {official.length > 0 && (
                <Section
                  title="Set by the coaches"
                  note="Published to the panel, and watched by name."
                  entries={official}
                />
              )}
              {personal.length > 0 && (
                <Section title="Made by the panel" note="Anyone can build one." entries={personal} />
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

type Item = { playlistId: string; title: string; startMs: number; endMs: number };

type Entry = {
  id: string;
  title: string;
  description: string | null;
  isOfficial: boolean;
  authorName: string | null;
  items: Item[];
  assigned: number;
  watched: number;
  /** Empty unless the viewer is a coach. */
  stillToWatch: string[];
};

/** How many names to print before "and n more". */
const NAMED = 4;

function Section({ title, note, entries }: { title: string; note: string; entries: Entry[] }) {
  return (
    <section>
      <div className="section-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="title text-xl">{title}</h2>
        <span className="caption">{note}</span>
      </div>

      <div className="mt-6 grid gap-x-12 gap-y-12 md:grid-cols-2">
        {entries.map((p) => (
          <PlaylistEntry key={p.id} entry={p} />
        ))}
      </div>
    </section>
  );
}

/**
 * One playlist, printed as a running order: what it is, who made it, how
 * long it runs, and the first few clips numbered in the order they play —
 * the numbers are the point of a playlist, so here they earn their boxes.
 */
function PlaylistEntry({ entry: p }: { entry: Entry }) {
  const runMs = p.items.reduce((sum, i) => sum + Math.max(0, i.endMs - i.startMs), 0);
  const rest = p.items.length - PREVIEW;

  return (
    <article>
      <Link
        href={`/playlists/${p.id}`}
        className="title block text-[1.3rem] hover:underline"
        style={{ textWrap: "balance" }}
      >
        {p.title}
      </Link>
      {p.description && (
        <p className="mt-1.5 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
          {p.description}
        </p>
      )}
      <p className="caption tabular mt-2">
        {p.authorName ?? "Removed"}, {p.items.length} clip{p.items.length === 1 ? "" : "s"},{" "}
        {formatClock(runMs)} running
      </p>

      {p.assigned > 0 && <Watched watched={p.watched} assigned={p.assigned} />}
      {p.stillToWatch.length > 0 && (
        <p className="caption mt-1.5">
          Still to watch: {p.stillToWatch.slice(0, NAMED).join(", ")}
          {p.stillToWatch.length > NAMED && ` and ${p.stillToWatch.length - NAMED} more`}.
        </p>
      )}

      {p.items.length > 0 && (
        <ol className="mt-4 border-t" style={{ borderColor: "var(--color-line)" }}>
          {p.items.slice(0, PREVIEW).map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-3 border-b py-2"
              style={{ borderColor: "var(--color-line)" }}
            >
              <span className="jersey shrink-0">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[14px]">
                {item.title || "Untitled clip"}
              </span>
              <span className="tabular shrink-0 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                {formatClock(item.endMs - item.startMs)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex items-center gap-4">
        <Link href={`/playlists/${p.id}`} className="btn-outline">
          Play from the start
        </Link>
        {rest > 0 && (
          <span className="caption">
            and {rest} more clip{rest === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * How many of the people it was set for have opened it. Spot ink, not
 * green: having watched is not something that happened on the field.
 */
function Watched({ watched, assigned }: { watched: number; assigned: number }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="meter w-32 shrink-0" aria-hidden>
        {watched > 0 && (
          <span style={{ width: `${(watched / assigned) * 100}%`, background: "var(--color-ash)" }} />
        )}
      </div>
      <span className="tabular text-[13px] font-semibold">
        Watched by {watched} of {assigned}
      </span>
    </div>
  );
}
