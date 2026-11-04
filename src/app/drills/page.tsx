import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { drillGroups, drills, teams, users } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { copyReadyDrill, createDrill, createDrillGroup } from "@/lib/actions/drills";
import { drillSummary, parseDrill, type DrillData } from "@/lib/hurling/drill";
import { GROUP_NAME_MAX } from "@/lib/hurling/drill-groups";
import { READY_CATEGORIES, READY_DRILLS, isReadyCategory } from "@/lib/hurling/drill-library";
import { ballFor } from "@/lib/hurling/codes";
import { homeKit } from "@/lib/hurling/kit";
import { Nav } from "@/components/ui/Nav";
import { DrillDiagram } from "@/components/drills/DrillArt";
import { GroupTools } from "@/components/drills/GroupTools";

/**
 * The coaches' drill book, in two parts.
 *
 * "Our drills" is the club's own, filed into groups a coach makes (attacking,
 * defending, restarts). "Ready-made" is a small library every club has, copied
 * into the book with one button and then changed freely; it is code, not
 * rows. Which part and which group or category are in the address, so a
 * link, the back button and a refresh all land where the coach was.
 *
 * Each drill is printed as its own diagram, where everyone starts and the
 * route each takes, so the list can be scanned for "the one with the overlap"
 * without opening any of them.
 */
export default async function DrillsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; group?: string; category?: string }>;
}) {
  const user = await requireUser();
  if (!isCoach(user)) redirect("/");
  const sp = await searchParams;
  const ready = sp.view === "ready";

  const [groups, rows, [team]] = await Promise.all([
    db.select().from(drillGroups).where(eq(drillGroups.teamId, user.teamId)).orderBy(asc(drillGroups.name)),
    db
      .select({
        id: drills.id,
        groupId: drills.groupId,
        title: drills.title,
        notes: drills.notes,
        data: drills.data,
        updatedAt: drills.updatedAt,
        authorName: users.displayName,
      })
      .from(drills)
      .leftJoin(users, eq(users.id, drills.createdBy))
      .where(eq(drills.teamId, user.teamId))
      .orderBy(desc(drills.updatedAt)),
    db.select({ code: teams.code }).from(teams).where(eq(teams.id, user.teamId)).limit(1),
  ]);

  const entries = rows.map((r) => ({ ...r, drill: parseDrill(JSON.parse(r.data)) }));
  const kit = homeKit({ primary: user.primaryColour, secondary: user.secondaryColour });
  const diagram = { code: user.teamCode, badgeVersion: user.badgeVersion, kit };

  const chosenGroup = groups.find((g) => g.id === sp.group) ?? null;
  const showUngrouped = sp.group === "none";
  const category = isReadyCategory(sp.category) ? sp.category : null;
  const ungrouped = entries.filter((e) => e.groupId === null);
  const countIn = (groupId: string) => entries.filter((e) => e.groupId === groupId).length;

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
              {chosenGroup && <input type="hidden" name="groupId" value={chosenGroup.id} />}
              <button type="submit" className="btn-primary">
                New drill
              </button>
            </form>

            <nav aria-label="Drill book" className="mt-8 flex gap-5 border-b text-[14px]" style={{ borderColor: "var(--color-line)" }}>
              <BookTab href="/drills" current={!ready}>
                Our drills
              </BookTab>
              <BookTab href="/drills?view=ready" current={ready}>
                Ready-made
              </BookTab>
            </nav>

            {ready ? (
              <ul className="mt-4 space-y-0.5" aria-label="Ready-made categories">
                <SideLink href="/drills?view=ready" current={!category} count={READY_DRILLS.length}>
                  All
                </SideLink>
                {READY_CATEGORIES.map((c) => (
                  <SideLink
                    key={c}
                    href={`/drills?view=ready&category=${encodeURIComponent(c)}`}
                    current={category === c}
                    count={READY_DRILLS.filter((d) => d.category === c).length}
                  >
                    {c}
                  </SideLink>
                ))}
              </ul>
            ) : (
              <>
                <ul className="mt-4 space-y-0.5" aria-label="Your groups">
                  <SideLink href="/drills" current={!chosenGroup && !showUngrouped} count={entries.length}>
                    All drills
                  </SideLink>
                  {groups.map((g) => (
                    <SideLink key={g.id} href={`/drills?group=${g.id}`} current={chosenGroup?.id === g.id} count={countIn(g.id)}>
                      {g.name}
                    </SideLink>
                  ))}
                  {groups.length > 0 && ungrouped.length > 0 && (
                    <SideLink href="/drills?group=none" current={showUngrouped} count={ungrouped.length}>
                      Not in a group
                    </SideLink>
                  )}
                </ul>
                <form action={createDrillGroup} className="mt-4 flex gap-2">
                  <input
                    name="name"
                    maxLength={GROUP_NAME_MAX}
                    required
                    placeholder="New group, e.g. Restarts"
                    aria-label="New group name"
                    className="field min-w-0 flex-1"
                  />
                  <button type="submit" className="btn-ghost">
                    Add
                  </button>
                </form>
              </>
            )}
          </header>

          {ready ? (
            <ReadySection category={category} groups={groups} ball={ballFor(team?.code ?? "hurling")} diagram={diagram} />
          ) : entries.length === 0 ? (
            <div className="section-head">
              <p className="py-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                No drills yet. A new one opens with four on three attacking the goal,
                or pick a set-up from 1 v 1 to 15 v 15. Drag them where they start,
                add a step, and drag them again.{" "}
                <Link href="/drills?view=ready" className="underline">
                  Browse the ready-made drills
                </Link>{" "}
                to start from one.
              </p>
            </div>
          ) : chosenGroup ? (
            <section>
              <div className="section-head">
                <h2 className="title text-xl">{chosenGroup.name}</h2>
                <GroupTools id={chosenGroup.id} name={chosenGroup.name} drillCount={countIn(chosenGroup.id)} />
              </div>
              <DrillGrid
                entries={entries.filter((e) => e.groupId === chosenGroup.id)}
                empty="Nothing in this group yet. New drill adds one here, or move an existing drill into it from its own page."
                diagram={diagram}
              />
            </section>
          ) : showUngrouped ? (
            <section>
              <div className="section-head">
                <h2 className="title text-xl">Not in a group</h2>
              </div>
              <DrillGrid entries={ungrouped} empty="Every drill is in a group." diagram={diagram} />
            </section>
          ) : groups.length === 0 ? (
            <section>
              <div className="section-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="title text-xl">The drill book</h2>
                <span className="caption">Most recently changed first. Make a group to sort them.</span>
              </div>
              <DrillGrid entries={entries} empty="" diagram={diagram} />
            </section>
          ) : (
            <div className="space-y-14">
              {groups
                .filter((g) => countIn(g.id) > 0)
                .map((g) => (
                  <section key={g.id}>
                    <div className="section-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h2 className="title text-xl">
                        <Link href={`/drills?group=${g.id}`} className="hover:underline">
                          {g.name}
                        </Link>
                      </h2>
                      <span className="caption tabular">{countIn(g.id)}</span>
                    </div>
                    <DrillGrid entries={entries.filter((e) => e.groupId === g.id)} empty="" diagram={diagram} />
                  </section>
                ))}
              {ungrouped.length > 0 && (
                <section>
                  <div className="section-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 className="title text-xl">Not in a group</h2>
                    <span className="caption tabular">{ungrouped.length}</span>
                  </div>
                  <DrillGrid entries={ungrouped} empty="" diagram={diagram} />
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

type Diagram = { code: Parameters<typeof DrillDiagram>[0]["code"]; badgeVersion: number | null; kit: ReturnType<typeof homeKit> };
type Entry = {
  id: string;
  title: string;
  notes: string;
  updatedAt: number;
  authorName: string | null;
  drill: DrillData;
};

function DrillGrid({ entries, empty, diagram }: { entries: Entry[]; empty: string; diagram: Diagram }) {
  if (entries.length === 0) {
    return (
      <p className="mt-6 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
        {empty}
      </p>
    );
  }
  return (
    <div className="mt-6 grid gap-x-10 gap-y-12 md:grid-cols-2">
      {entries.map((e) => (
        <article key={e.id}>
          <Link href={`/drills/${e.id}`} className="block" aria-label={`Open ${e.title}`}>
            <DrillDiagram data={e.drill} uid={`d${e.id.slice(0, 8)}`} {...diagram} />
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
  );
}

/**
 * The library. Drawn in the club's own colours and the team's own ball, so a
 * camogie club sees sliotars and a football club sees footballs, and each one
 * can be filed straight into a group as it is added.
 */
function ReadySection({
  category,
  groups,
  ball,
  diagram,
}: {
  category: (typeof READY_CATEGORIES)[number] | null;
  groups: { id: string; name: string }[];
  ball: Parameters<(typeof READY_DRILLS)[number]["build"]>[0];
  diagram: Diagram;
}) {
  const shown = READY_CATEGORIES.filter((c) => !category || c === category);
  return (
    <div className="space-y-14">
      <p className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
        A starting set every club has. Add one to your drills and it is yours to change: nothing you
        do to your copy touches these.
      </p>
      {shown.map((c) => (
        <section key={c}>
          <div className="section-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="title text-xl">{c}</h2>
          </div>
          <div className="mt-6 grid gap-x-10 gap-y-12 md:grid-cols-2">
            {READY_DRILLS.filter((d) => d.category === c).map((r) => {
              const data = r.build(ball);
              return (
                <article key={r.id}>
                  <DrillDiagram data={data} uid={`r${r.id}`} {...diagram} />
                  <h3 className="title mt-3 text-[1.2rem]" style={{ textWrap: "balance" }}>
                    {r.title}
                  </h3>
                  <p className="caption tabular mt-1.5">{drillSummary(data)}</p>
                  <p className="mt-2 line-clamp-3 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
                    {r.notes}
                  </p>
                  <form action={copyReadyDrill} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="readyId" value={r.id} />
                    {groups.length > 0 && (
                      <select name="groupId" aria-label={`Group for ${r.title}`} className="field w-auto max-w-[11rem]" defaultValue="none">
                        <option value="none">No group</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button type="submit" className="btn-ghost">
                      Add to our drills
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function BookTab({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="-mb-px border-b-2 pb-2"
      style={{
        borderColor: current ? "var(--color-ink)" : "transparent",
        color: current ? "var(--color-ink)" : "var(--color-ink-dim)",
        fontWeight: current ? 600 : 400,
      }}
    >
      {children}
    </Link>
  );
}

function SideLink({
  href,
  current,
  count,
  children,
}: {
  href: string;
  current: boolean;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className="flex items-baseline justify-between gap-3 border-l-2 py-1 pl-3 text-[14px] hover:underline"
        style={{
          borderColor: current ? "var(--color-ink)" : "transparent",
          color: current ? "var(--color-ink)" : "var(--color-ink-dim)",
          fontWeight: current ? 600 : 400,
        }}
      >
        <span className="min-w-0 truncate">{children}</span>
        <span className="caption tabular">{count}</span>
      </Link>
    </li>
  );
}
