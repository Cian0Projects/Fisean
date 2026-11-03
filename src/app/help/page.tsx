import type { Metadata } from "next";
import { requireUserFor } from "@/lib/auth/guard";
import { guidesFor } from "@/lib/guides";
import { Nav } from "@/components/ui/Nav";
import { GuideCard } from "@/components/help/GuideCard";

export const metadata: Metadata = { title: "Help videos" };

/**
 * Short videos of the app being used, for the signed in. Each member sees the
 * ones that suit their role: a player is not shown how to log stats or draw a
 * drill, which are coaches' tools. The two a stranger can also watch before
 * signing up are here too, so a coach has one place to point a new player to.
 */
export default async function HelpPage() {
  const user = await requireUserFor("/help");
  const guides = guidesFor(user.role);

  return (
    <>
      <Nav user={user} />
      <main className="sheet py-12">
        <h1 className="display text-5xl">Help videos</h1>
        <p className="measure mt-4 text-[16px] leading-relaxed text-ink-dim">
          Short videos of the app in use, each under a minute.
        </p>
        <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
          {guides.map((g) => (
            <GuideCard key={g.slug} guide={g} />
          ))}
        </div>
      </main>
    </>
  );
}
