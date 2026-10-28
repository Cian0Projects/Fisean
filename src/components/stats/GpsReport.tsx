/**
 * The GPS report for one match: two pages, the same table twice.
 *
 * Page one ranks every player by total distance, page two by high speed
 * running. Both carry all the columns, so a player's whole line reads across
 * on either page; the page's own measure gets a bar and a tint, which is what
 * makes the ranking visible at a glance.
 *
 * Colour here is only a category: teal is the distance page, violet the
 * sprint page, taken from the lane colours so both survive printing. Green
 * and red are left alone because they mean good and bad for us, and a long
 * run is neither. Every bar also carries its figure, so nothing depends on
 * seeing the colour.
 */
import { ClubBadge } from "@/components/ui/ClubBadge";
import { matchDateLong } from "@/lib/format";
import {
  GPS_COLUMNS,
  barShare,
  groupThousands,
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

const COLUMN_UNITS: Record<GpsKey, string> = {
  totalDistance: "metres",
  hmld: "metres",
  hsr: "metres",
  maxSpeed: "m/s",
  percentSpeed: "of own best",
  accels: "count",
  decels: "count",
};

function show(key: GpsKey, n: number | null): string {
  if (n == null) return "n/a";
  if (key === "maxSpeed") return n.toFixed(2);
  if (key === "percentSpeed") return `${Math.round(n)}%`;
  return groupThousands(Math.round(n));
}

const labelOf = (key: GpsKey) => GPS_COLUMNS.find((c) => c.key === key)!;

export function GpsReport({ teamName, badgeVersion, match, players }: Props) {
  const where = [match.competition, match.venue].filter(Boolean).join(" at ");
  const pages: {
    key: GpsKey;
    accent: string;
    title: string;
    lead: string;
    explains: GpsKey[];
  }[] = [
    {
      key: "totalDistance",
      accent: "var(--color-lane-delivery)",
      title: "Total distance",
      lead: "Every player, from the most ground covered to the least.",
      explains: ["totalDistance", "hmld", "accels", "decels"],
    },
    {
      key: "hsr",
      accent: "var(--color-lane-turnover)",
      title: "High speed running",
      lead: "Every player, from the most sprint work to the least.",
      explains: ["hsr", "maxSpeed", "percentSpeed"],
    },
  ];

  return (
    <div className="space-y-10 print:space-y-0">
      {pages.map((page, i) => {
        const ranked = rankBy(players, page.key);
        const stats = summarise(players, page.key);
        const peak = stats.leader?.value ?? null;
        const measure = labelOf(page.key);
        const hasColumn = stats.count > 0;
        const lowest = ranked.filter((p) => p[page.key] != null).at(-1);

        return (
          <section
            key={page.key}
            aria-labelledby={`gps-${page.key}`}
            className={`rounded p-5 sm:p-8 print:rounded-none print:border-0 print:p-0 ${i > 0 ? "print:break-before-page" : ""}`}
            style={{ border: "1px solid var(--color-line-strong)", background: "var(--color-stage)" }}
          >
            <header
              className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b-[3px] pb-4"
              style={{ borderColor: "var(--color-rule)" }}
            >
              <ClubBadge version={badgeVersion} className="h-16 w-16" />
              <div className="min-w-0 flex-1">
                <div className="caption">{teamName} GPS report</div>
                <h2 className="display text-[clamp(1.8rem,4.5vw,2.8rem)]" id={`gps-${page.key}`}>
                  {page.title}
                </h2>
                <p className="mt-1 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
                  Against {match.opponent}, {matchDateLong(match.playedOn)}
                  {where ? `, ${where}` : ""}
                </p>
              </div>
              <div className="tabular text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                Page {i + 1} of 2
              </div>
            </header>

            <p className="mt-4 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
              {page.lead}
            </p>

            {!hasColumn ? (
              <p className="mt-6 py-8 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                This export has no {measure.label} column, so there is nothing to rank here. Upload a file that
                includes it to fill this page.
              </p>
            ) : (
              <>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
                  <Figure
                    accent={page.accent}
                    term="Top"
                    value={show(page.key, stats.leader!.value)}
                    note={stats.leader!.name}
                  />
                  <Figure
                    accent={page.accent}
                    term="Squad average"
                    value={show(page.key, stats.average)}
                    note={`${stats.count} ${stats.count === 1 ? "player" : "players"}`}
                  />
                  <Figure
                    accent={page.accent}
                    term="Lowest"
                    value={show(page.key, lowest![page.key])}
                    note={lowest!.name}
                  />
                </dl>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[44rem] border-collapse text-[14px] print:min-w-0 print:text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--color-rule)" }}>
                        <th className="w-9 px-2 py-2 text-left font-medium">
                          <span className="sr-only">Rank</span>
                        </th>
                        <th className="px-2 py-2 text-left font-medium">Player</th>
                        {GPS_COLUMNS.map((c) => (
                          <th
                            key={c.key}
                            className={`px-2 py-2 font-medium ${c.key === page.key ? "w-[26%] text-left" : "text-right"}`}
                            style={c.key === page.key ? { background: tint(page.accent, 16) } : undefined}
                          >
                            <div>{c.label}</div>
                            <div className="caption font-normal">{COLUMN_UNITS[c.key]}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((p, n) => (
                        <tr key={`${p.name}-${n}`} style={{ borderBottom: "1px solid var(--color-line)" }}>
                          <td className="px-2 py-1.5">
                            <span
                              className="tabular inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold"
                              style={
                                n === 0
                                  ? { background: page.accent, color: "var(--color-stage)" }
                                  : { color: "var(--color-ink-faint)" }
                              }
                            >
                              {n + 1}
                            </span>
                          </td>
                          <td className={`px-2 py-1.5 whitespace-nowrap ${n === 0 ? "font-bold" : "font-medium"}`}>
                            {p.name}
                          </td>
                          {GPS_COLUMNS.map((c) =>
                            c.key === page.key ? (
                              <td key={c.key} className="px-2 py-1.5" style={{ background: tint(page.accent, 8) }}>
                                <div className="flex items-center gap-3">
                                  <div
                                    className="h-3 flex-1 overflow-hidden rounded-sm"
                                    style={{ background: tint(page.accent, 14) }}
                                    aria-hidden
                                  >
                                    <div
                                      className="h-full rounded-sm"
                                      style={{ width: `${barShare(p[c.key], peak) * 100}%`, background: page.accent }}
                                    />
                                  </div>
                                  <span className="tabular w-12 text-right font-bold">{show(c.key, p[c.key])}</span>
                                </div>
                              </td>
                            ) : (
                              <td key={c.key} className="tabular px-2 py-1.5 text-right">
                                {show(c.key, p[c.key])}
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--color-line-strong)" }}>
              <h3 className="title text-[15px]">What the figures mean</h3>
              <dl className="mt-3 grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-2">
                {page.explains.map((k) => {
                  const c = labelOf(k);
                  return (
                    <div key={k} className="break-inside-avoid">
                      <dt className="font-semibold">{c.label}</dt>
                      <dd style={{ color: "var(--color-ink-dim)" }}>{c.means}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** A tint of the page's colour over whatever is behind it, so dark mode and print both stay legible. */
function tint(colour: string, percent: number): string {
  return `color-mix(in srgb, ${colour} ${percent}%, transparent)`;
}

function Figure({ accent, term, value, note }: { accent: string; term: string; value: string; note: string }) {
  return (
    <div className="rounded px-3 py-2" style={{ background: tint(accent, 12), borderLeft: `4px solid ${accent}` }}>
      <dt className="caption">{term}</dt>
      <dd className="tabular text-[22px] leading-tight font-bold">{value}</dd>
      <dd className="truncate" style={{ color: "var(--color-ink-dim)" }}>
        {note}
      </dd>
    </div>
  );
}
