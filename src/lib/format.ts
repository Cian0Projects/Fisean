/**
 * Dates as a club would write them.
 *
 * Matches are stored as a plain ISO date with no time, so they are formatted
 * from the string rather than from a Date in the viewer's timezone — a match
 * played on the 9th is the 9th in Kilkenny and in Boston, and a phone an hour
 * behind should not shift it to the 8th.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d, weekday: DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

/** "Sun 9 Sep" — the way a fixture is listed. */
export function matchDate(iso: string): string {
  const p = parts(iso);
  return p ? `${p.weekday} ${p.d} ${MONTHS[p.m - 1]}` : iso;
}

/** "Sunday 9 September 2026" — for the one match in the lead position. */
export function matchDateLong(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
  ];
  const month = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][p.m - 1];
  return `${weekday} ${p.d} ${month} ${p.y}`;
}

/** Bytes as a coach would say them: "3.1 GB". */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}
