/**
 * RECURRING SCHEDULES — which days a recurring rule fires on.
 *
 * Everything here works on calendar days written "YYYY-MM-DD" (Lagos days),
 * never on clock instants, so the answer is the same on every machine and
 * there is no time-of-day drift.
 *
 *   daily    every day
 *   weekly   every 7 days from the first day (same weekday)
 *   monthly  the chosen day of each month; a day a month does not have
 *            (the 31st in April, the 30th in February) falls on that month's
 *            last day. The chosen day is remembered, so Jan 31 → Feb 28 →
 *            Mar 31, not Jan 31 → Feb 28 → Mar 28.
 *
 * Pure rules only: no database, no React.
 */
import type { RecurringCadence } from "./forecast";
import { isDateKey } from "./transaction-rules";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

function keyOf(y: number, m: number, d: number): string {
  // Date.UTC normalises overflow (month 12 → next year), so callers can add freely
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toISOString().slice(0, 10);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** `key` moved by a whole number of days */
export function addDaysToKey(key: string, days: number): string {
  const { y, m, d } = parseKey(key);
  return keyOf(y, m, d + days);
}

/** The chosen day of month, or the month's last day if it has fewer days */
function monthlyOn(y: number, m: number, dayOfMonth: number): string {
  const normalised = new Date(Date.UTC(y, m - 1, 1));
  const year = normalised.getUTCFullYear();
  const month = normalised.getUTCMonth() + 1;
  return keyOf(year, month, Math.min(dayOfMonth, daysInMonth(year, month)));
}

/** The monthly day to use: the rule's own, else the day of the anchor date. */
export function monthlyDay(anchorKey: string, dayOfMonth: number | null | undefined): number {
  const day = dayOfMonth ?? parseKey(anchorKey).d;
  return Math.min(Math.max(Math.trunc(day), 1), 31);
}

/**
 * The first occurrence on or after `fromKey`, for a schedule that started at
 * `anchorKey`. (Weekly keeps the anchor's weekday; monthly uses `dayOfMonth`.)
 */
export function nextOccurrenceOnOrAfter(
  anchorKey: string,
  cadence: RecurringCadence,
  dayOfMonth: number | null | undefined,
  fromKey: string
): string {
  const from = fromKey > anchorKey ? fromKey : anchorKey;
  if (cadence === "daily") return from;
  if (cadence === "weekly") {
    const a = parseKey(anchorKey);
    const f = parseKey(from);
    const gap = Math.round(
      (Date.UTC(f.y, f.m - 1, f.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS
    );
    return addDaysToKey(anchorKey, Math.ceil(gap / 7) * 7);
  }
  const day = monthlyDay(anchorKey, dayOfMonth);
  const f = parseKey(from);
  const thisMonth = monthlyOn(f.y, f.m, day);
  return thisMonth >= from ? thisMonth : monthlyOn(f.y, f.m + 1, day);
}

/** The occurrence strictly after `key` (which must itself be an occurrence). */
export function occurrenceAfter(
  key: string,
  cadence: RecurringCadence,
  dayOfMonth: number | null | undefined
): string {
  if (cadence === "daily") return addDaysToKey(key, 1);
  if (cadence === "weekly") return addDaysToKey(key, 7);
  const { y, m } = parseKey(key);
  return monthlyOn(y, m + 1, monthlyDay(key, dayOfMonth));
}

export interface DueOccurrences {
  /** Occurrence days that are due (on or before today), oldest first */
  keys: string[];
  /** True if more are still due beyond `limit` (the next run continues) */
  more: boolean;
}

/**
 * Every occurrence from `nextKey` up to and including `todayKey`: this is the
 * catch-up. A rule that missed three days returns three days, each filed under
 * its own date, not today's.
 */
export function dueOccurrences(opts: {
  nextKey: string;
  cadence: RecurringCadence;
  dayOfMonth: number | null | undefined;
  todayKey: string;
  limit: number;
}): DueOccurrences {
  if (!isDateKey(opts.nextKey) || !isDateKey(opts.todayKey)) {
    return { keys: [], more: false };
  }
  const keys: string[] = [];
  let key = opts.nextKey;
  while (key <= opts.todayKey) {
    if (keys.length >= opts.limit) return { keys, more: true };
    keys.push(key);
    key = occurrenceAfter(key, opts.cadence, opts.dayOfMonth);
  }
  return { keys, more: false };
}
