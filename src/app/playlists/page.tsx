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

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-lg font-semibold">Playlists</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
            Build one from the review screen — select a clip and add it from the
            details panel.
          </p>
        </div>

        {rows.length === 0 && (
          <div className="card p-8 text-center text-sm" style={{ color: "var(--color-ink-dim)" }}>
            No playlists yet.
          </div>
        )}

        {official.length > 0 && (
          <Section title="Team playlists" rows={official} />
        )}
        {personal.length > 0 && (
          <Section title="Personal playlists" rows={personal} />
        )}
      </main>
    </>
  );
}

function Section({
  title,
  rows,
}: {
  title: string;
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
      <h2 className="label mb-3">{title}</h2>
      <div className="space-y-2">
        {rows.map((p) => (
          <Link
            key={p.id}
            href={`/playlists/${p.id}`}
            className="card flex items-center gap-4 p-4 transition-colors hover:border-[var(--color-line-strong)]"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium">{p.title}</div>
              {p.description && (
                <div className="mt-0.5 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
                  {p.description}
                </div>
              )}
              <div className="mt-1 text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                {p.authorName ?? "Removed"}
              </div>
            </div>
            <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {p.itemCount} clip{p.itemCount === 1 ? "" : "s"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
