import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { drills, users } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { createDrill } from "@/lib/actions/drills";
import { drillSummary, parseDrill } from "@/lib/hurling/drill";
import { Nav } from "@/components/ui/Nav";
import { DrillDiagram } from "@/components/drills/DrillArt";

/**
 * The coaches' drill book. Each drill is printed as its own diagram — where
 * everyone starts and the route each takes — so the list can be scanned for
 * "the one with the overlap" without opening any of them.
 */
export default async function DrillsPage() {
  const user = await requireUser();
  if (!isCoach(user)) redirect("/");

  const rows = await db
    .select({
      id: drills.id,
      title: drills.title,
      notes: drills.notes,
      data: drills.data,
      updatedAt: drills.updatedAt,
      authorName: users.displayName,
    })
    .from(drills)
    .leftJoin(users, eq(users.id, drills.createdBy))
    .where(eq(drills.teamId, user.teamId))
    .orderBy(desc(drills.updatedAt));

  const entries = rows.map((r) => ({ ...r, drill: parseDrill(JSON.parse(r.data)) }));

  return (
    <>
      <Nav user={user} />

      <main className="sheet pt-10 pb-20 lg:pt-14">
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <header className="lg:sticky lg:top-24 lg:self-start">
            <h1 className="display text-[clamp(2.75rem,5vw,3.75rem)]">Drills</h1>
            <p className="mt-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
              Draw a drill on the pitch and play it back, step by step.
            </p>
            <p className="caption mt-3 max-w-[30ch]">
              Two sides, as many players and balls as it needs. Only coaches see
              this page.
            </p>
            <form action={createDrill} className="mt-6">
              <button type="submit" className="btn-primary">
                New drill
              </button>
            </form>
          </header>

          {entries.length === 0 ? (
            <div className="section-head">
              <p className="py-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                No drills yet. A new one opens with four on three attacking the goal,
                or pick a set-up from 1 v 1 to 15 v 15. Drag them where they start,
                add a step, and drag them again.
              </p>
            </div>
          ) : (
            <section>
              <div className="section-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="title text-xl">The drill book</h2>
                <span className="caption">Most recently changed first.</span>
              </div>
              <div className="mt-6 grid gap-x-10 gap-y-12 md:grid-cols-2">
                {entries.map((e) => (
                  <article key={e.id}>
                    <Link href={`/drills/${e.id}`} className="block" aria-label={`Open ${e.title}`}>
                      <DrillDiagram data={e.drill} uid={`d${e.id.slice(0, 8)}`} />
                    </Link>
                    <Link
                      href={`/drills/${e.id}`}
                      className="title mt-3 block text-[1.2rem] hover:underline"
                      style={{ textWrap: "balance" }}
                    >
                      {e.title}
                    </Link>
                    <p className="caption tabular mt-1.5">
                      {drillSummary(e.drill)}. {e.authorName ?? "Removed"},{" "}
                      {new Date(e.updatedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}
                    </p>
                    {e.notes && (
                      <p className="mt-2 line-clamp-2 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
                        {e.notes}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
