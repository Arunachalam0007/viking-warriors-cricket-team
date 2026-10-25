// India Standard Time has no daylight saving: always UTC+05:30.
const IST_OFFSET_MS = 330 * 60 * 1000;
export const TIME_ZONE = "Asia/Kolkata";

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → "YYYY-MM-DD" as the calendar date in IST */
export function istDate(d: Date | string): string {
  const t = new Date(typeof d === "string" ? d : d.getTime());
  const ist = new Date(t.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

/** Date → "YYYY-MM" month key in IST */
export function istMonth(d: Date | string): string {
  return istDate(d).slice(0, 7);
}

export function todayIst(): string {
  return istDate(new Date());
}

/** "2026-10" → UTC instants [start, end) covering that IST month */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS);
  return { start, end };
}

/** "2026-10" → ["2026-10-01", "2026-10-31"] date strings (inclusive) */
export function monthDateRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

/** Monday of the IST week containing the given date, as "YYYY-MM-DD" */
export function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** IST date range [from, to] (inclusive) → UTC instants [start, end) */
export function dateRangeToInstants(from: string, to: string): { start: Date; end: Date } {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return {
    start: new Date(Date.UTC(fy, fm - 1, fd) - IST_OFFSET_MS),
    end: new Date(Date.UTC(ty, tm - 1, td + 1) - IST_OFFSET_MS),
  };
}

/** Months from `from` to `to` inclusive, newest first: ["2026-10", "2026-09", …] */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = to.split("-").map(Number);
  const [fy, fm] = from.split("-").map(Number);
  while (y > fy || (y === fy && m >= fm)) {
    out.push(`${y}-${pad(m)}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonthFmt = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export function formatMonth(month: string, short = false): string {
  const [y, m] = month.split("-").map(Number);
  return (short ? shortMonthFmt : monthFmt).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function formatDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  const value = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00+05:30`) : new Date(d);
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: TIME_ZONE }).format(value);
}

export function formatDateTime(d: Date | string) {
  return formatDate(d, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
