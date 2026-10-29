/**
 * The GPS report for one match: two pages, each one sheet of A4.
 *
 * Page one is workload: every player ranked by total distance, with HMLD and
 * the accelerations and decelerations beside it. Page two is speed: every
 * player ranked by high speed running, with top speed, how near it was to
 * their own best, and how much of their distance was at pace. The two answer
 * different questions (how much did they do, and how fast), so the columns are
 * split between them rather than repeated.
 *
 * On paper each page is a fixed box (`.gps-page` in globals.css) on a named
 * print page with no margin, which is what turns off the browser's own date,
 * address and page-number header and footer. The page draws its own instead,
 * and the rows tighten with the size of the squad so a full panel still fits
 * on its one sheet.
 *
 * Colour here is only a category: teal is the workload page, violet the speed
 * page, taken from the lane colours so both survive printing. Green and red
 * are left alone because they mean good and bad for us, and a long run is
 * neither. Every bar also carries its figure, so nothing depends on seeing
 * the colour.
 */
import { ClubBadge } from "@/components/ui/ClubBadge";
import { matchDateLong } from "@/lib/format";
import {
  GPS_COLUMNS,
  barShare,
  groupThousands,
  hsrShare,
  rankBy,
  summarise,
  type GpsKey,
  type GpsPlayer,
} from "@/lib/hurling/gps";

type Props = {
  teamName: string;
  badgeVersion: number | null;
  match: { opponent: string; competition: string | null; venue: string | null; playedOn: string };
  players: GpsPlayer[];
};

/** One column of a page's table. `bar` draws the figure as a bar against the squad's best. */
type Col = {
  id: string;
  label: string;
  unit: string;
  value: (p: GpsPlayer) => number | null;
  text: (n: number) => string;
  bar?: boolean;
};

const n0 = (n: number) => groupThousands(Math.round(n));
const n1 = (n: number) => (Math.round(n * 10) / 10).toString();
const n2 = (n: number) => n.toFixed(2);

const COLS = {
  totalDistance: { id: "totalDistance", label: "Total distance", unit: "metres", value: (p) => p.totalDistance, text: n0 },
  hmld: { id: "hmld", label: "HMLD", unit: "metres", value: (p) => p.hmld, text: n0 },
  accels: { id: "accels", label: "Accels", unit: "count", value: (p) => p.accels, text: n0 },
  decels: { id: "decels", label: "Decels", unit: "count", value: (p) => p.decels, text: n0 },
  hsr: { id: "hsr", label: "HSR", unit: "metres", value: (p) => p.hsr, text: n0 },
  maxSpeed: { id: "maxSpeed", label: "Top speed", unit: "m/s", value: (p) => p.maxSpeed, text: n2 },
  maxSpeedKmh: {
    id: "maxSpeedKmh",
    label: "Top speed",
    unit: "km/h",
    value: (p) => (p.maxSpeed == null ? null : p.maxSpeed * 3.6),
    text: n1,
  },
  percentSpeed: { id: "percentSpeed", label: "% speed", unit: "of own best", value: (p) => p.percentSpeed, text: (n) => `${Math.round(n)}%` },
  hsrShare: { id: "hsrShare", label: "HSR share", unit: "of distance", value: hsrShare, text: (n) => `${n1(n)}%` },
} satisfies Record<string, Col>;

const labelOf = (key: GpsKey) => GPS_COLUMNS.find((c) => c.key === key)!;

/** Not a stored column, so it is explained here rather than in GPS_COLUMNS. */
const HSR_SHARE_MEANS =
  "High speed running as a share of the player's total distance. A higher share means more of their work was done at pace, not just a lot of ground covered.";

type Page = {
  accent: string;
  title: string;
  lead: string;
  /** The measures the page can rank by, best first: the first one the export has is used. */
  rankBy: GpsKey[];
  cols: Col[];
  explains: { label: string; means: string }[];
};

const PAGES: Page[] = [
  {
    accent: "var(--color-lane-delivery)",
    title: "Workload",
    lead: "Every player, from the most ground covered to the least.",
    rankBy: ["totalDistance"],
    cols: [{ ...COLS.totalDistance, bar: true }, COLS.hmld, COLS.accels, COLS.decels],
    explains: ["totalDistance", "hmld", "accels", "decels"].map((k) => labelOf(k as GpsKey)),
  },
  {
    accent: "var(--color-lane-turnover)",
    title: "Speed",
    lead: "Every player, from the most high speed running to the least.",
    rankBy: ["hsr", "maxSpeed"],
    cols: [{ ...COLS.hsr, bar: true }, COLS.maxSpeed, COLS.maxSpeedKmh, COLS.percentSpeed, COLS.hsrShare],
    explains: [
      ...["hsr", "maxSpeed", "percentSpeed"].map((k) => labelOf(k as GpsKey)),
      { label: "HSR share", means: HSR_SHARE_MEANS },
    ],
  },
];

/**
 * How tight the rows are set on paper, so a squad of any size lands on one
 * sheet. Worked out against the 276 mm inside the page margins: the header,
 * headline figures, column heads, notes and footer take about 107 mm, leaving
 * roughly 169 mm for rows. At the line height the table uses (1.25) a row is
 * its text plus twice the padding, so the three steps hold 22, 28 and 34
 * players, and the last, smallest step holds up to 45.
 */
function density(count: number) {
  if (count <= 22) return "print:py-[1.2mm] print:text-[9.5pt]";
  if (count <= 28) return "print:py-[0.8mm] print:text-[9pt]";
  if (count <= 34) return "print:py-[0.5mm] print:text-[8pt]";
  return "print:py-[0.3mm] print:text-[7pt]";
}

export function GpsReport({ teamName, badgeVersion, match, players }: Props) {
  const where = [match.competition, match.venue].filter(Boolean).join(" at ");
  const rowFit = density(players.length);

  return (
    <div className="space-y-10 print:space-y-0">
      {PAGES.map((page, i) => {
        // Rank by the first measure this export actually has.
        const key = page.rankBy.find((k) => summarise(players, k).count > 0) ?? null;
        const ranked = key ? rankBy(players, key) : [];
        const stats = key ? summarise(players, key) : null;
        const cols = page.cols.filter((c) => players.some((p) => c.value(p) != null));
        // The bar goes on the column the page is ranked by. If the page fell
        // back to its second measure the barred column is gone, and the
        // first one left takes the bar instead.
        const barId = key ? (page.cols.find((c) => c.bar && cols.includes(c))?.id ?? cols[0]?.id) : null;
        const peaks = Object.fromEntries(
          cols.map((c) => [c.id, Math.max(0, ...players.map((p) => c.value(p) ?? 0))]),
        );

        return (
          <section
            key={page.title}
            aria-labelledby={`gps-${i}`}
            className="gps-page flex flex-col rounded p-5 sm:p-8 print:rounded-none print:border-0"
            style={{ border: "1px solid var(--color-line-strong)", background: "var(--color-stage)" }}
          >
            <header
              className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b-[3px] pb-3"
              style={{ borderColor: "var(--color-rule)" }}
            >
              <ClubBadge version={badgeVersion} className="h-14 w-14 print:h-[15mm] print:w-[15mm]" />
              <div className="min-w-0 flex-1">
                <div className="caption">{teamName} GPS report</div>
                <h2 className="display text-[clamp(1.8rem,4.5vw,2.6rem)] print:text-[28pt]" id={`gps-${i}`}>
                  {page.title}
                </h2>
              </div>
              <div className="text-[13px] leading-snug sm:text-right">
                <div className="font-semibold">Against {match.opponent}</div>
                <div style={{ color: "var(--color-ink-dim)" }}>{matchDateLong(match.playedOn)}</div>
                {where && <div className="caption">{where}</div>}
              </div>
            </header>

            {!key || !stats ? (
              <p className="mt-6 py-8 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                This export has none of the columns this page ranks by, so there is nothing to show here. Upload a
                file that includes {page.rankBy.map((k) => labelOf(k).label).join(" or ")} to fill this page.
              </p>
            ) : (
              <>
                <p className="mt-3 text-[14px] print:hidden" style={{ color: "var(--color-ink-dim)" }}>
                  {page.lead}
                </p>

                <dl className="mt-3 grid grid-cols-3 gap-3 text-[13px] print:mt-[4mm] print:gap-[3mm] print:text-[9pt]">
                  {figures(i, players, stats).map((f) => (
                    <Figure key={f.term} accent={page.accent} {...f} />
                  ))}
                </dl>

                <div className="mt-4 overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[40rem] border-collapse text-[14px] print:min-w-0 print:text-[9.5pt] print:leading-tight">
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--color-rule)" }}>
                        <th className="w-9 px-2 py-2 text-left font-medium print:w-[8mm]">
                          <span className="sr-only">Rank</span>
                        </th>
                        <th className="px-2 py-2 text-left font-medium">Player</th>
                        {cols.map((c) => (
                          <th
                            key={c.id}
                            className={`px-2 py-2 font-medium ${c.id === barId ? "w-[30%] text-left" : "text-right"}`}
                            style={c.id === barId ? { background: tint(page.accent, 16) } : undefined}
                          >
                            <div className="print:leading-tight">{c.label}</div>
                            <div className="caption font-normal print:text-[7.5pt]">{c.unit}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((p, n) => (
                        <tr key={`${p.name}-${n}`} style={{ borderBottom: "1px solid var(--color-line)" }}>
                          <td className={`px-2 py-1.5 ${rowFit}`}>
                            <span
                              // On paper the circle takes its height from the line, so a
                              // tight row is never held open by it.
                              className="tabular inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold print:h-auto print:w-auto print:min-w-[1.5em] print:px-[0.4mm] print:text-[1em]"
                              style={
                                n === 0
                                  ? { background: page.accent, color: "var(--color-stage)" }
                                  : { color: "var(--color-ink-faint)" }
                              }
                            >
                              {n + 1}
                            </span>
                          </td>
                          <td className={`px-2 py-1.5 whitespace-nowrap ${rowFit} ${n === 0 ? "font-bold" : "font-medium"}`}>
                            {p.name}
                          </td>
                          {cols.map((c) => {
                            const v = c.value(p);
                            const shown = v == null ? "n/a" : c.text(v);
                            return c.id === barId ? (
                              <td key={c.id} className={`px-2 py-1.5 ${rowFit}`} style={{ background: tint(page.accent, 8) }}>
                                <div className="flex items-center gap-3">
                                  <div
                                    className="h-3 flex-1 overflow-hidden rounded-sm print:h-[2.6mm]"
                                    style={{ background: tint(page.accent, 14) }}
                                    aria-hidden
                                  >
                                    <div
                                      className="h-full rounded-sm"
                                      style={{ width: `${barShare(v, peaks[c.id]) * 100}%`, background: page.accent }}
                                    />
                                  </div>
                                  <span className="tabular w-12 text-right font-bold">{shown}</span>
                                </div>
                              </td>
                            ) : (
                              <td key={c.id} className={`tabular px-2 py-1.5 text-right ${rowFit}`}>
                                {shown}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 border-t pt-3 print:mt-[4mm] print:pt-[2mm]" style={{ borderColor: "var(--color-line-strong)" }}>
                  <h3 className="title text-[15px] print:text-[9pt]">What the figures mean</h3>
                  <dl className="mt-2 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2 print:grid-cols-4 print:gap-x-[4mm] print:text-[7.5pt] print:leading-tight">
                    {page.explains.map((e) => (
                      <div key={e.label} className="break-inside-avoid">
                        <dt className="font-semibold">{e.label}</dt>
                        <dd style={{ color: "var(--color-ink-dim)" }}>{e.means}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </>
            )}

            <footer
              className="mt-6 grid grid-cols-3 items-center border-t pt-2 text-[12px] print:mt-auto print:text-[8pt]"
              style={{ borderColor: "var(--color-line-strong)", color: "var(--color-ink-faint)" }}
            >
              <span>Ardawn</span>
              <span className="text-center">For coaches only</span>
              <span className="tabular text-right">
                Page {i + 1} of {PAGES.length}
              </span>
            </footer>
          </section>
        );
      })}
    </div>
  );
}

/** The three headline figures at the top of each page. Ones the export cannot supply are left out. */
function figures(page: number, players: GpsPlayer[], ranked: ReturnType<typeof summarise>) {
  const out: { term: string; value: string; note: string }[] = [];
  if (page === 0) {
    const lowest = rankBy(players, "totalDistance").at(-1)!;
    out.push(
      { term: "Most distance", value: n0(ranked.leader!.value), note: ranked.leader!.name },
      { term: "Squad average", value: n0(ranked.average!), note: `${ranked.count} ${ranked.count === 1 ? "player" : "players"}` },
      { term: "Least distance", value: n0(lowest.totalDistance), note: lowest.name },
    );
    return out;
  }
  const hsr = summarise(players, "hsr");
  if (hsr.leader) {
    out.push({ term: "Most HSR", value: `${n0(hsr.leader.value)} m`, note: hsr.leader.name });
  }
  const fastest = summarise(players, "maxSpeed");
  if (fastest.leader) {
    out.push({
      term: "Fastest",
      value: `${n2(fastest.leader.value)} m/s`,
      note: `${fastest.leader.name}, ${n1(fastest.leader.value * 3.6)} km/h`,
    });
  }
  if (hsr.average != null) {
    out.push({ term: "Squad average HSR", value: `${n0(hsr.average)} m`, note: `${hsr.count} ${hsr.count === 1 ? "player" : "players"}` });
  } else if (fastest.average != null) {
    out.push({ term: "Squad average top speed", value: `${n2(fastest.average)} m/s`, note: `${fastest.count} players` });
  }
  return out;
}

/** A tint of the page's colour over whatever is behind it, so dark mode and print both stay legible. */
function tint(colour: string, percent: number): string {
  return `color-mix(in srgb, ${colour} ${percent}%, transparent)`;
}

function Figure({ accent, term, value, note }: { accent: string; term: string; value: string; note: string }) {
  return (
    <div className="rounded px-3 py-2" style={{ background: tint(accent, 12), borderLeft: `4px solid ${accent}` }}>
      <dt className="caption print:text-[8pt]">{term}</dt>
      <dd className="tabular text-[22px] leading-tight font-bold print:text-[16pt]">{value}</dd>
      <dd className="truncate" style={{ color: "var(--color-ink-dim)" }}>
        {note}
      </dd>
    </div>
  );
}
