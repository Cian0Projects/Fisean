/**
 * The parts the season pages share: which season and competition they cover,
 * the tabs between the team and the players, and the two small charts.
 *
 * Server components, no client JavaScript: the scope is a link, so a season
 * view can be bookmarked or sent round, and the charts are plain SVG drawn
 * once. No chart library, for the same reason there is no PDF one.
 *
 * Colour follows the rule everywhere else in the app. A trend line is ink,
 * because a season's shooting going up is not "good for us" in the way a
 * score is; its marks are figures, so they are ash. Only the margin bars use
 * green and red, because a win and a loss are exactly what those mean, and
 * the bars carry shape too (filled above the line, ringed below it).
 */
import Link from "next/link";
import type { Scope } from "@/lib/hurling/trends";
import { verdict } from "@/components/matches/ResultBox";
import { matchDate } from "@/lib/format";

/* ------------------------------------------------------------------ scope */

/** A season page's link, keeping the scope and anything else asked for. */
export function scopeHref(path: string, scope: Scope, extra: Record<string, string | null> = {}): string {
  const params = new URLSearchParams();
  params.set("season", scope.season ?? "all");
  if (scope.competition) params.set("competition", scope.competition);
  for (const [k, v] of Object.entries(extra)) if (v != null) params.set(k, v);
  return `${path}?${params}`;
}

/** "2026 season", "2026 league", "Every season". */
export function scopeTitle(scope: Scope): string {
  const when = scope.season ?? "Every season";
  if (scope.competition) return `${when}, ${scope.competition}`;
  return scope.season ? `${scope.season} season` : when;
}

export function ScopeBar({
  path,
  scope,
  seasons,
  competitions,
  extra,
}: {
  path: string;
  scope: Scope;
  seasons: string[];
  competitions: string[];
  extra?: Record<string, string | null>;
}) {
  const seasonChoices: { label: string; value: string | null }[] = [
    ...seasons.map((s) => ({ label: s, value: s })),
    ...(seasons.length > 1 ? [{ label: "Every season", value: null }] : []),
  ];
  return (
    <div className="no-print mt-5 space-y-2 text-[13px]">
      <Choices
        label="Season"
        items={seasonChoices.map((c) => ({
          label: c.label,
          href: scopeHref(path, { season: c.value, competition: null }, extra),
          on: scope.season === c.value,
        }))}
      />
      {competitions.length > 1 && (
        <Choices
          label="Competition"
          items={[
            { label: "All", href: scopeHref(path, { ...scope, competition: null }, extra), on: scope.competition == null },
            ...competitions.map((c) => ({
              label: c,
              href: scopeHref(path, { ...scope, competition: c }, extra),
              on: scope.competition === c,
            })),
          ]}
        />
      )}
    </div>
  );
}

function Choices({ label, items }: { label: string; items: { label: string; href: string; on: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="label w-24 shrink-0">{label}</span>
      {items.map((i) => (
        <Link
          key={i.label}
          href={i.href}
          aria-current={i.on ? "page" : undefined}
          className={i.on ? "font-semibold" : "underline-offset-2 hover:underline"}
          style={{ color: i.on ? "var(--color-ink)" : "var(--color-ink-dim)" }}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

/** Between the team's season and the players'. The match list is the Stats page itself. */
export function SeasonTabs({ current, scope }: { current: "team" | "players"; scope: Scope }) {
  const tabs = [
    { id: "team", label: "Team", href: scopeHref("/stats/team", scope) },
    { id: "players", label: "Players", href: scopeHref("/stats/players", scope) },
    { id: "matches", label: "Matches", href: "/stats" },
  ];
  return (
    <nav className="no-print flex gap-1" aria-label="Season views">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === current ? "page" : undefined}
          className={t.id === current ? "btn-primary text-xs" : "btn-ghost text-xs"}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/* ---------------------------------------------------------------- section */

export function SeasonSection({
  id,
  title,
  note,
  children,
}: {
  id?: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-14 scroll-mt-6 print:break-inside-avoid">
      <div className="section-head mb-6">
        <h2 className="title text-xl">{title}</h2>
        {note && (
          <p className="measure mt-1 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            {note}
          </p>
        )}
      </div>
      <div className="space-y-8">{children}</div>
    </section>
  );
}

/**
 * A figure in a season table. Nothing (a zero passed as null) reads as a
 * dash, as on the match sheet, because a zero is noise in a long table.
 */
export function Cell({ children, negative }: { children: React.ReactNode; negative?: boolean }) {
  const empty = children == null || children === false;
  return (
    <td className="tabular px-2 py-2 text-right">
      {empty ? (
        <span style={{ color: "var(--color-ink-faint)" }}>&ndash;</span>
      ) : (
        <span style={negative ? { color: "var(--color-danger-ink)" } : undefined}>{children}</span>
      )}
    </td>
  );
}

/* ----------------------------------------------------------------- charts */

const W = 320;
const H = 96;
const PAD = 10;

export type TrendPoint = { label: string; value: number | null };

/**
 * One figure, match by match, oldest on the left. A match that did not log
 * it is a gap in the line, not a drop to zero. The dashed rule is the
 * season's own figure, so a point above it is a match better than the
 * season, whatever the scale.
 */
export function Trend({
  title,
  points,
  min = 0,
  max,
  average,
  format = (n) => String(n),
}: {
  title: string;
  points: TrendPoint[];
  min?: number;
  /** Top of the scale; the highest point when not given. */
  max?: number;
  average?: number | null;
  format?: (n: number) => string;
}) {
  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  if (values.length < 2) return null;

  const top = Math.max(max ?? Math.max(...values), min + 1);
  const floor = Math.min(min, ...values);
  const x = (i: number) => (points.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (points.length - 1));
  const y = (v: number) => H - PAD - ((v - floor) / (top - floor)) * (H - 2 * PAD);

  // Broken wherever a match did not log it.
  const runs: string[] = [];
  let run: string[] = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (run.length) runs.push(run.join(" "));
      run = [];
    } else {
      run.push(`${run.length ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
    }
  });
  if (run.length) runs.push(run.join(" "));

  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="title text-[14px]">{title}</h3>
        {average != null && (
          <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Season {format(average)}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={title}>
        {floor < 0 && (
          <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" strokeWidth={1} />
        )}
        {average != null && (
          <line
            x1={PAD}
            x2={W - PAD}
            y1={y(average)}
            y2={y(average)}
            stroke="var(--color-ink-faint)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}
        {runs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--color-ink-dim)" strokeWidth={1.5} strokeLinejoin="round" />
        ))}
        {points.map((p, i) =>
          p.value == null ? null : (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill="var(--color-ash)">
              <title>{`${p.label}: ${format(p.value)}`}</title>
            </circle>
          ),
        )}
      </svg>
      <p className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </p>
    </figure>
  );
}

/**
 * The season's results as bars: won above the line, filled; lost below it,
 * ringed. A sheet that logged only our score has no margin, and shows as a
 * short dashed stub so the gap in the run is visible rather than hidden.
 */
export function MarginBars({
  results,
}: {
  results: { opponent: string; playedOn: string; margin: number | null }[];
}) {
  if (results.length === 0) return null;
  const biggest = Math.max(3, ...results.map((r) => Math.abs(r.margin ?? 0)));
  const mid = H / 2;
  const reach = mid - PAD;
  const slot = (W - 2 * PAD) / results.length;
  const bar = Math.min(18, slot * 0.6);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Margin in each match">
        <line x1={PAD} x2={W - PAD} y1={mid} y2={mid} stroke="var(--color-line-strong)" strokeWidth={1} />
        {results.map((r, i) => {
          const cx = PAD + slot * (i + 0.5);
          const label = `${r.opponent}, ${matchDate(r.playedOn)}: ${r.margin == null ? "only our score logged" : verdict(r.margin)}`;
          if (r.margin == null) {
            return (
              <line
                key={i}
                x1={cx}
                x2={cx}
                y1={mid - 6}
                y2={mid + 6}
                stroke="var(--color-mark)"
                strokeWidth={2}
                strokeDasharray="2 2"
              >
                <title>{label}</title>
              </line>
            );
          }
          const h = Math.max(2, (Math.abs(r.margin) / biggest) * reach);
          const won = r.margin > 0;
          const level = r.margin === 0;
          return (
            <rect
              key={i}
              x={cx - bar / 2}
              y={won || level ? mid - h : mid}
              width={bar}
              height={h}
              fill={won ? "var(--color-brand)" : "none"}
              stroke={won ? "none" : level ? "var(--color-ink-dim)" : "var(--color-danger-ink)"}
              strokeWidth={1.5}
            >
              <title>{label}</title>
            </rect>
          );
        })}
      </svg>
    </figure>
  );
}
