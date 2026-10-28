/**
 * The logging streak: how many days in a row the user has recorded something.
 * It counts the habit of keeping the books, not what was spent. Days are UTC
 * days of when a transaction was RECORDED (a backdated entry does not count for
 * the day it is filed under). The streak is still alive if the last log was
 * yesterday: today is not over yet.
 */
export interface LoggingStreak {
  /** Consecutive days ending today (or yesterday when nothing is logged yet today) */
  current: number;
  loggedToday: boolean;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function loggingStreak(recordedAt: Date[], now: Date): LoggingStreak {
  const days = new Set(recordedAt.map(dayKey));
  const loggedToday = days.has(dayKey(now));
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!loggedToday) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let current = 0;
  while (days.has(dayKey(cursor))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { current, loggedToday };
}

/** What the streak becomes once something is recorded today */
export function streakAfterLoggingToday(s: LoggingStreak): number {
  return s.loggedToday ? s.current : s.current + 1;
}
