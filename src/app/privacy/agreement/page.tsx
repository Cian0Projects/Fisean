import type { Metadata, Viewport } from "next";
import { Answer, PublicShell } from "@/components/home/PublicShell";
import { socialFor } from "@/lib/seo";

/*
 * The data processing agreement between a club and Ardawn: the contract
 * Article 28 of the GDPR requires whenever one party holds personal data
 * for another. A committee asks for it once footage of minors is involved.
 *
 * Written to be read by a club secretary, not a solicitor: one clause to a
 * row, each saying what happens rather than what "shall" happen. It covers
 * what Article 28(3) lists, in that order of concern to a club rather than
 * the article's order.
 *
 * As with /privacy, every security and retention line describes the code:
 * club scoping (guard.ts), the 15 minute sign-in code (email-code.ts), the
 * day-long playback link (sigv4.ts), sign-in records purged after a day
 * (email-sign-in.ts), 30 days of backups (docs/DEPLOYMENT.md), closing the
 * club (deleteClub in actions/admin.ts). Change those, change this.
 *
 * PROVIDER and SUBPROCESSORS are the two facts most likely to change: a
 * company formed, a server moved. Changing either is a change to the
 * agreement, which clause 12 says clubs hear about 30 days ahead.
 */

const TITLE = "Data agreement: Ardawn";
const DESCRIPTION = "The data processing agreement between a club and Ardawn, under the GDPR.";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy/agreement" },
  title: TITLE,
  description: DESCRIPTION,
  ...socialFor(TITLE, DESCRIPTION),
};

export const viewport: Viewport = { themeColor: "#ffffff" };

const UPDATED = "19 October 2026";
const PROVIDER = "Cian Ó Cathasaigh, trading as Ardawn";

const SUBPROCESSORS = [
  { name: "Cloudflare R2", what: "Stores and serves match footage", where: "EU jurisdiction" },
  { name: "Contabo", what: "The server that runs the app and holds its database", where: "Germany" },
  { name: "Zoho ZeptoMail", what: "Sends sign-in codes and share notices", where: "EU data centre" },
];

export default function AgreementPage() {
  return (
    <PublicShell>
      <section className="sheet pb-10 pt-12 sm:pb-14 sm:pt-16">
        <p className="mb-5 text-[13px] font-semibold text-ink-dim">Data processing agreement</p>
        <h1 className="headline max-w-3xl text-[clamp(3rem,6vw,5.6rem)]">
          Your club decides. We look after it.
        </h1>
        <p className="measure mt-7 text-[17px] leading-relaxed text-ink-dim sm:text-[19px]">
          This is the agreement between your club and Ardawn about the personal data your club
          keeps on Ardawn. It is what the GDPR requires when one party holds data for another.
          Setting up a club on Ardawn is agreeing to it. The plain answers are on{" "}
          <a href="/privacy" className="font-semibold text-ink underline">
            privacy and footage
          </a>
          .
        </p>
      </section>

      <section className="sheet pb-16 sm:pb-20">
        <dl className="border-t-[3px] border-rule">
          <Answer q="1. Who this is between">
            <p>
              Your club or team, acting through its admin on Ardawn, and {PROVIDER} (&ldquo;Ardawn&rdquo;,
              &ldquo;we&rdquo;).
            </p>
            <p>
              Your club is the controller: it decides who is filmed, what is uploaded and who is on
              the panel. Ardawn is the processor: we store that data and show it to the people your
              club lets in, and do nothing else with it.
            </p>
          </Answer>

          <Answer q="2. The data it covers">
            <p>
              About the people on your panel (players, coaches and admins): their name, email
              address, role, usual position, jersey numbers on match sheets, when they last used
              Ardawn, and the clips, comments, drawings, playlists and stats they make.
            </p>
            <p>
              About anyone in your footage, including opponents, referees and spectators, some of
              them under 18: the video itself, and any clip, tag or stat that refers to them.
            </p>
            <p>
              When someone asks for a sign-in code, the network address it came from, kept for a day
              to stop codes being requested in bulk.
            </p>
          </Answer>

          <Answer q="3. What we do with it">
            <p>
              Only what running Ardawn for your club needs: store it, show it to your panel, and send
              the emails the app sends. We do not sell it, advertise with it, share it with other
              clubs, or use it to train AI or to build anything for anyone else.
            </p>
            <p>
              Using the app is how your club gives us its instructions: uploading, deleting, adding
              people and removing them. If the law ever required us to do anything else with your
              data, we would tell you first, unless the law forbade that.
            </p>
          </Answer>

          <Answer q="4. Where it is kept">
            <p>
              In the EU. We will not move it outside the European Economic Area without telling your
              club first, and only with the safeguards the GDPR requires for such a move.
            </p>
          </Answer>

          <Answer q="5. Who else handles it">
            <p>Three services do part of the work, each bound to protect the data as we are:</p>
            <ul className="space-y-2">
              {SUBPROCESSORS.map((s) => (
                <li key={s.name}>
                  <strong className="text-ink">{s.name}</strong>: {s.what.toLowerCase()}.{" "}
                  <span className="text-ink-faint">{s.where}.</span>
                </li>
              ))}
            </ul>
            <p>
              Before adding or replacing one, we email your club&apos;s admins 30 days ahead. If your
              club objects, it can close its account and everything is deleted.
            </p>
          </Answer>

          <Answer q="6. How we keep it safe">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Each club&apos;s data is kept apart, and every request is checked against the club of
                the person making it.
              </li>
              <li>
                There are no passwords. Each sign-in is a one-time code sent by email, which works for
                15 minutes and allows five tries.
              </li>
              <li>
                Everything travels encrypted. Links to footage are signed and stop working within a
                day. Footage is encrypted where it is stored.
              </li>
              <li>The database is backed up daily, and backups are kept for 30 days.</li>
              <li>
                Only {PROVIDER.split(",")[0]} can reach the servers, and looks at a club&apos;s data
                only when the club asks for help, or to keep Ardawn running and secure. Anyone else
                ever given that access will be bound to keep it confidential.
              </li>
            </ul>
          </Answer>

          <Answer q="7. If something goes wrong">
            <p>
              If your club&apos;s data is ever lost, exposed or reached by someone who should not
              have it, we email your admins within 48 hours of finding out, with what we know. That
              leaves your club time to meet its own duty to tell the Data Protection Commission
              within 72 hours. We then help with whatever follows.
            </p>
          </Answer>

          <Answer q="8. Helping with people's rights">
            <p>
              Your admins can do most of this themselves: see everyone on the panel, remove someone
              (which deletes their account), and delete any match or file of footage.
            </p>
            <p>
              For anything the app cannot do, such as a copy of everything held about one person,
              email us and we will help within a month. If someone contacts us directly about your
              club&apos;s data, we pass it to your club.
            </p>
          </Answer>

          <Answer q="9. What your club looks after">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Having a lawful basis to film and share what it uploads, including any consent from
                parents its child safeguarding policy requires for under-18s.
              </li>
              <li>
                Telling its members how their data is used. The{" "}
                <a href="/privacy" className="font-semibold text-ink underline">
                  privacy page
                </a>{" "}
                can be passed on as it is.
              </li>
              <li>
                Keeping the club code within the panel, and removing people who leave.
              </li>
              <li>Uploading only footage it has the right to use.</li>
            </ul>
          </Answer>

          <Answer q="10. When it ends">
            <p>
              Your club can close its account at any time, from the squad page. Everything is deleted
              from Ardawn at once, and from the backups within 30 days.
            </p>
            <p>
              If we ever stop running Ardawn, we give your admins at least 60 days&apos; notice
              before anything is deleted.
            </p>
          </Answer>

          <Answer q="11. Checking up on us">
            <p>
              Your committee can ask us anything about how its data is handled, and we answer in
              writing, with whatever information it needs to see that this agreement is being kept.
            </p>
          </Answer>

          <Answer q="12. Changes">
            <p>
              If this agreement changes, we email your admins 30 days before the change applies. The
              current version is always here, with the date it was last changed.
            </p>
          </Answer>

          <Answer q="13. The law">
            <p>
              This agreement is governed by Irish law, and the Irish courts decide any dispute about
              it. Nothing in it reduces what either of us owes under the GDPR.
            </p>
          </Answer>
        </dl>

        <div className="mt-12 border-t-[3px] border-rule pt-6">
          <h2 className="title text-[19px]">A signed copy</h2>
          <p className="measure mt-3 text-[15px] leading-relaxed text-ink-dim">
            If your committee wants one on file, print this page, sign it for the club and email it
            to{" "}
            <a href="mailto:hello@ardawnsport.ie" className="font-semibold text-ink underline">
              hello@ardawnsport.ie
            </a>
            . We sign it and send it back.
          </p>
          <div className="mt-8 grid gap-10 sm:grid-cols-2">
            <Signature party="For the club" />
            <Signature party={`For ${PROVIDER}`} />
          </div>
          <p className="caption mt-10">Last updated {UPDATED}.</p>
        </div>
      </section>
    </PublicShell>
  );
}

/* Ruled lines to sign on, for the printed copy. */
function Signature({ party }: { party: string }) {
  return (
    <div className="text-[14px]">
      <p className="font-semibold">{party}</p>
      {["Name", "Role", "Signed", "Date"].map((line) => (
        <div key={line} className="mt-6 flex items-end gap-3">
          <span className="w-14 text-ink-faint">{line}</span>
          <span className="flex-1 border-b border-line-strong" />
        </div>
      ))}
    </div>
  );
}
