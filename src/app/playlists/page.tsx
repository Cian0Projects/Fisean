import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { playlistItems, playlists, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";

export default async function PlaylistsPage() {
  const user = await requireUser();

  const rows = await db
    .select({
      id: playlists.id,
      title: playlists.title,
      description: playlists.description,
      isOfficial: playlists.isOfficial,
      createdBy: playlists.createdBy,
      authorName: users.displayName,
      createdAt: playlists.createdAt,
      itemCount: sql<number>`(
        SELECT count(*) FROM ${playlistItems}
        WHERE ${playlistItems.playlistId} = ${playlists.id}
      )`,
    })
    .from(playlists)
    .leftJoin(users, eq(users.id, playlists.createdBy))
    .where(eq(playlists.teamId, user.teamId))
    .orderBy(desc(playlists.isOfficial), desc(playlists.createdAt));

  const official = rows.filter((r) => r.isOfficial);
  const personal = rows.filter((r) => !r.isOfficial);

  return (
    <>
      <Nav user={user} />

      <main className="mx-auto max-w-4xl px-4 pt-8 pb-16">
        <header className="border-b pb-5" style={{ borderColor: "var(--color-line-strong)" }}>
          <h1 className="display text-[clamp(2rem,5vw,2.8rem)]">Playlists</h1>
          <p className="measure mt-2 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            A run of clips in the order you want them watched. Build one from
            the review screen: select a clip and add it from the details panel.
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="py-10 text-[15px]" style={{ color: "var(--color-ink-faint)" }}>
            None yet. The first one takes about a minute.
          </p>
        ) : (
          <div className="mt-10 space-y-10">
            {official.length > 0 && (
              <Section
                title="Set by the coaches"
                note="Published to the panel, and watched by name."
                rows={official}
              />
            )}
            {personal.length > 0 && (
              <Section title="Made by the panel" note="Anyone can build one." rows={personal} />
            )}
          </div>
        )}
      </main>
    </>
  );
}

function Section({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: {
    id: string;
    title: string;
    description: string | null;
    authorName: string | null;
    itemCount: number;
  }[];
}) {
  return (
    <section>
      <div
        className="mb-1 flex items-baseline justify-between gap-3 border-b pb-2"
        style={{ borderColor: "var(--color-line-strong)" }}
      >
        <h2 className="title text-base">{title}</h2>
        <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {note}
        </span>
      </div>

      <ul>
        {rows.map((p) => (
          <li key={p.id}>
            <Link href={`/playlists/${p.id}`} className="fixture flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[16px]">{p.title}</div>
                {p.description && (
                  <div
                    className="mt-0.5 truncate text-[13px]"
                    style={{ color: "var(--color-ink-dim)" }}
                  >
                    {p.description}
                  </div>
                )}
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                  {p.authorName ?? "Removed"}
                </div>
              </div>
              <span className="tabular shrink-0 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                {p.itemCount} clip{p.itemCount === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
