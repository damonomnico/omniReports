/**
 * Date helpers. Dates are plain "YYYY-MM-DD" strings (calendar days in the
 * client's timezone) so they survive serialisation and never shift by an hour.
 */

export type DateRange = {
  from: string;
  to: string;
  /** Number of days in the range, inclusive. */
  days: number;
};

export type RangeSelection = {
  preset: string;
  label: string;
  current: DateRange;
  /** The period of the same length immediately before, when comparing. */
  previous: DateRange | null;
  compare: boolean;
};

export const RANGE_PRESETS = [
  { key: "7d", label: "Last 7 days" },
  { key: "28d", label: "Last 28 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "6m", label: "Last 6 months" },
  { key: "12m", label: "Last 12 months" },
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in the given IANA timezone. */
export function todayInTz(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return fromUtc(now);
  }
}

export function addDays(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export function addMonths(date: string, n: number): string {
  const d = toUtc(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fromUtc(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const d = toUtc(date);
  return fromUtc(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const d = toUtc(date).getUTCDay();
  return d === 0 ? 7 : d;
}

export function makeRange(from: string, to: string): DateRange {
  return { from, to, days: daysBetween(from, to) + 1 };
}

export function previousRange(range: DateRange): DateRange {
  const to = addDays(range.from, -1);
  return makeRange(addDays(to, -(range.days - 1)), to);
}

/** Every date in the range, inclusive. */
export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  for (let i = 0; i < range.days; i++) out.push(addDays(range.from, i));
  return out;
}

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Turns URL search params (?range=28d or ?from=..&to=..) into concrete dates.
 * `endOffset` is where rolling ranges end relative to today: -1 (yesterday)
 * for traffic data that is only complete for finished days, 0 for rankings.
 */
export function resolveRange(
  params: Params,
  timeZone: string,
  opts: { endOffset?: number; defaultPreset?: string; now?: Date } = {},
): RangeSelection {
  const today = todayInTz(timeZone, opts.now);
  const end = addDays(today, opts.endOffset ?? -1);
  const compare = first(params.compare) !== "0";

  const from = first(params.from);
  const to = first(params.to);
  if (isIsoDate(from) && isIsoDate(to) && from <= to && daysBetween(from, to) <= 800) {
    const current = makeRange(from, to > today ? today : to);
    return {
      preset: "custom",
      label: `${formatDay(current.from)} to ${formatDay(current.to)}`,
      current,
      previous: compare ? previousRange(current) : null,
      compare,
    };
  }

  const requested = first(params.range) ?? opts.defaultPreset ?? "28d";
  const preset = RANGE_PRESETS.find((p) => p.key === requested) ?? RANGE_PRESETS[1];

  let current: DateRange;
  switch (preset.key) {
    case "this-month":
      current = makeRange(startOfMonth(today), today);
      break;
    case "last-month": {
      const lastDay = addDays(startOfMonth(today), -1);
      current = makeRange(startOfMonth(lastDay), lastDay);
      break;
    }
    case "6m":
      current = makeRange(addDays(addMonths(end, -6), 1), end);
      break;
    case "12m":
      current = makeRange(addDays(addMonths(end, -12), 1), end);
      break;
    default: {
      const n = Number.parseInt(preset.key, 10);
      current = makeRange(addDays(end, -(n - 1)), end);
    }
  }

  // "Last month" compares with the calendar month before it, not a same-length slice.
  let previous: DateRange | null = null;
  if (compare) {
    if (preset.key === "last-month") {
      const prevLast = addDays(current.from, -1);
      previous = makeRange(startOfMonth(prevLast), prevLast);
    } else {
      previous = previousRange(current);
    }
  }

  return { preset: preset.key, label: preset.label, current, previous, compare };
}

const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const SHORT_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const MONTH_FMT = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "4 Nov 2026" */
export function formatDay(date: string): string {
  return DAY_FMT.format(toUtc(date));
}

/** "4 Nov" */
export function formatDayShort(date: string): string {
  return SHORT_FMT.format(toUtc(date));
}

/** "Nov 2026" */
export function formatMonth(date: string): string {
  return MONTH_FMT.format(toUtc(date));
}

export function describeRange(range: DateRange): string {
  return `${formatDay(range.from)} to ${formatDay(range.to)}`;
}
