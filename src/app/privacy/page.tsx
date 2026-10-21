import type { Metadata, Viewport } from "next";
import { Answer, PublicShell } from "@/components/home/PublicShell";
import { socialFor } from "@/lib/seo";

/*
 * The page a club committee is sent to before it agrees to put footage of
 * its players online. It answers the questions they actually ask, in the
 * order they ask them: where is it, who can see it, what happens when
 * someone leaves. The contract behind it is /privacy/agreement.
 *
 * Every line is a description of what the code does, not a promise about
 * what it might do, and each one names where that is true so it can be
 * checked when the code changes:
 *
 *   EU storage        src/lib/storage/r2.ts (R2_JURISDICTION=eu)
 *   club scoping      assertSameTeam in src/lib/auth/guard.ts
 *   who may upload    isCoach in src/app/api/upload/route.ts
 *   removal           removeMember in src/lib/actions/admin.ts, which
 *                     cascades the person's sessions
 *   the day-long link stableWindow in src/lib/storage/sigv4.ts: playback
 *                     links are signed for up to 24 hours, so a video
 *                     already open outlives the session by that much
 *   deletion          deleteVideo, deleteMatch, deleteClub in the same
 *                     file, each removing the files from storage too
 *   one cookie        src/lib/auth/session.ts, 90 days
 *   backups           docs/DEPLOYMENT.md, kept 30 days
 *
 * If any of those change, this page changes with them.
 */

const TITLE = "Privacy and footage: Ardawn";
const DESCRIPTION =
  "Where a club's footage is stored, who can see it, and what happens when someone leaves the panel.";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  title: TITLE,
  description: DESCRIPTION,
  ...socialFor(TITLE, DESCRIPTION),
};

export const viewport: Viewport = { themeColor: "#ffffff" };

const UPDATED = "19 October 2026";

export default function PrivacyPage() {
  return (
    <PublicShell>
      <section className="sheet pb-10 pt-12 sm:pb-14 sm:pt-16">
        <p className="mb-5 text-[13px] font-semibold text-ink-dim">Privacy and footage</p>
        <h1 className="headline max-w-3xl text-[clamp(3rem,6vw,5.6rem)]">
          Your footage stays with your club.
        </h1>
        <p className="measure mt-7 text-[17px] leading-relaxed text-ink-dim sm:text-[19px]">
          The answers to what a club committee asks before match footage of its players goes
          online. Anything not covered here, email{" "}
          <a href="mailto:hello@ardawnsport.ie" className="font-semibold text-ink underline">
            hello@ardawnsport.ie
          </a>
          .
        </p>
      </section>

      <section className="sheet pb-16 sm:pb-20">
        <dl className="border-t-[3px] border-rule">
          <Answer q="Where is the footage stored?">
            <p>
              In the EU. Match video is kept in Cloudflare R2 storage held under its EU
              jurisdiction, so the files are stored in the EU and stay there. Video goes straight
              from the coach&apos;s browser into that storage and plays straight from it.
            </p>
            <p>
              Names, emails, clips, comments and stats are held in Ardawn&apos;s database on a
              server in the EU.
            </p>
          </Answer>

          <Answer q="Who can see it?">
            <p>
              Only the people on your club&apos;s panel. Every match, clip, playlist and stat
              belongs to one club, and every request is checked against the club of the person
              making it, so one club can never open another club&apos;s footage.
            </p>
            <p>
              Within the club, players can watch and make their own clips. Only coaches and admins
              can add footage, and only an admin can delete it or decide who is on the panel.
            </p>
          </Answer>

          <Answer q="How does someone get in?">
            <p>
              With your club&apos;s six-character code and an email address they can read. There
              are no passwords: each time someone signs in, a one-time code is sent to their email.
            </p>
            <p>
              Anyone holding the club code can join, so treat it like a key to the dressing room.
              Your admin can see everyone on the panel at any time, and if the code has gone further
              than it should, can change it in a moment. The old code stops working and nobody
              already on the panel is affected.
            </p>
          </Answer>

          <Answer q="What happens when a player leaves?">
            <p>
              An admin removes them from the panel, and their access ends at once. Every session
              they had is closed, so the next page they open signs them out, and they cannot sign
              back in to your club. A video that was already playing on their screen stops within a
              day, when its link expires.
            </p>
            <p>If they still know the club code, change it as well, so they cannot join again.</p>
          </Answer>

          <Answer q="What do you keep about people?">
            <p>
              A name, an email address, their role on the panel and the position they usually play.
              Alongside that, the clips, comments and stats people make in the app.
            </p>
            <p>
              Email is used to send sign-in codes and, unless someone turns it off, a note when
              footage or a clip is shared with them. Every one of those notes has a link to stop
              them.
            </p>
            <p>
              Ardawn sets one cookie, to keep you signed in for up to 90 days. There are no
              advertising cookies, no tracking and no analytics.
            </p>
          </Answer>

          <Answer q="Can footage and data be deleted?">
            <p>
              Yes, by your admin, from the squad page, without asking anyone. Deleting a file of
              footage or a whole match removes the video from storage, along with its clips and
              stats. Removing someone from the panel deletes their account. The clips they made and
              the stats logged against their jersey number stay with the club, without their name.
            </p>
            <p>
              Closing the club deletes everything at once: every match, file, clip, stat, drill and
              person. The database is backed up daily and backups are kept for 30 days, so a
              deletion is complete once the last backup holding it has aged out.
            </p>
          </Answer>

          <Answer q="What about under-18s?">
            <p>
              Ardawn does not decide who is filmed or when. That stays with your club, under its own
              child safeguarding policy. What Ardawn does is keep the footage inside the panel, and
              let an admin take anyone out of it at once.
            </p>
          </Answer>

          <Answer q="Is there a formal agreement?">
            <p>
              Yes. The{" "}
              <a href="/privacy/agreement" className="font-semibold text-ink underline">
                data agreement
              </a>{" "}
              sets out what Ardawn does with your club&apos;s data and what it never does, as the
              GDPR requires. Your committee can print it and have it signed.
            </p>
          </Answer>
        </dl>
        <p className="caption mt-8">Last updated {UPDATED}.</p>
      </section>
    </PublicShell>
  );
}
