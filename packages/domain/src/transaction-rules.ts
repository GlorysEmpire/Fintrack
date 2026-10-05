/**
 * TRANSACTION LIFECYCLE — when a transaction may still be changed, and how a
 * transaction gets its date.
 *
 *   Created  →  Editable window  →  Locked
 *
 * A transaction can be edited or deleted for a fixed time after it is RECORDED
 * (createdAt), then it is locked for good. The lock is not stored anywhere: it
 * is worked out from createdAt, which only the server ever sets. So it can not
 * drift, needs no background job, and a client can not move it.
 *
 * Pure rules only: no database, no React.
 */

/** How long after recording a transaction it can still be edited or deleted. */
export const TRANSACTION_EDIT_WINDOW_HOURS = 48;

const EDIT_WINDOW_MS = TRANSACTION_EDIT_WINDOW_HOURS * 60 * 60 * 1000;

export interface TransactionLockState {
  locked: boolean;
  /** The moment the edit window closes */
  editableUntil: Date;
  /** Milliseconds left to edit or delete (0 once locked) */
  msRemaining: number;
}

/**
 * Where a transaction is in its lifecycle.
 *
 * The window runs from when the transaction was recorded, not from the date it
 * is filed under: an expense recorded today and dated last week is editable
 * today, and changing its date never buys more time.
 */
export function transactionLockState(
  createdAt: Date | string,
  now: Date = new Date()
): TransactionLockState {
  const created =
    typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const createdMs = created instanceof Date ? created.getTime() : NaN;
  // An unreadable timestamp fails closed: locked.
  if (Number.isNaN(createdMs)) {
    return { locked: true, editableUntil: new Date(0), msRemaining: 0 };
  }
  const editableUntil = new Date(createdMs + EDIT_WINDOW_MS);
  const msRemaining = Math.max(0, editableUntil.getTime() - now.getTime());
  return { locked: msRemaining <= 0, editableUntil, msRemaining };
}

export function isTransactionLocked(
  createdAt: Date | string,
  now: Date = new Date()
): boolean {
  return transactionLockState(createdAt, now).locked;
}

/** The rule, in one sentence, for anywhere the app needs to state it. */
export const EDIT_WINDOW_RULE = `You can edit or delete a transaction for ${TRANSACTION_EDIT_WINDOW_HOURS} hours after you record it. After that it is locked.`;

/** Why a locked transaction can no longer be changed. */
export const LOCKED_EXPLANATION = `This transaction is locked. Transactions can be edited or deleted for ${TRANSACTION_EDIT_WINDOW_HOURS} hours after they are recorded. After that they become a permanent part of your history, so your past numbers stay trustworthy.`;

/** "47 hours", "35 minutes", "less than a minute" */
export function editWindowRemainingLabel(msRemaining: number): string {
  const minutes = Math.floor(msRemaining / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/* ─── Dates ───────────────────────────────────────────────────────── */

/** Dates before this are treated as typing mistakes. */
export const EARLIEST_TRANSACTION_DATE_KEY = "2000-01-01";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day written as "YYYY-MM-DD" (so not 2026-02-30). */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_KEY_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d
  );
}

/** The calendar day ("YYYY-MM-DD") an instant falls on in a given time zone. */
export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The instant stored for a transaction filed under a chosen calendar day.
 *
 * Noon UTC of that day. A user picks a day, not a moment; anchoring at noon UTC
 * keeps that day (and so its month) the same whether the server runs in UTC or
 * in Lagos, so a transaction dated 1 October can not slide into September.
 */
export function dateFromDateKey(key: string): Date {
  const m = DATE_KEY_PATTERN.exec(key);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

/** True for a date produced by dateFromDateKey: a chosen day with no real time of day. */
export function isDayOnlyDate(date: Date | string): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    d.getUTCHours() === 12 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

export type ResolvedTransactionDate =
  | {
      ok: true;
      /** The instant to store */
      date: Date;
      dateKey: string;
      /** true when the user filed it under a day other than today */
      backdated: boolean;
    }
  | { ok: false; error: string };

/**
 * Turn the day a user picked into the date to store.
 *
 * No day picked, or today → the real current moment (the time of day stays
 * meaningful). An earlier day → that day. Tomorrow or later is refused: a
 * transaction records something that has already happened.
 */
export function resolveTransactionDate(opts: {
  dateKey?: string | null;
  timeZone: string;
  now?: Date;
}): ResolvedTransactionDate {
  const now = opts.now ?? new Date();
  const todayKey = dateKeyInTimeZone(now, opts.timeZone);
  const key = opts.dateKey;

  if (key == null || key === "") {
    return { ok: true, date: now, dateKey: todayKey, backdated: false };
  }
  if (!isDateKey(key)) {
    return { ok: false, error: "Enter a valid date." };
  }
  if (key > todayKey) {
    return {
      ok: false,
      error:
        "The date can not be in the future. A transaction records something that has already happened.",
    };
  }
  if (key < EARLIEST_TRANSACTION_DATE_KEY) {
    return { ok: false, error: "That date is too far in the past." };
  }
  if (key === todayKey) {
    return { ok: true, date: now, dateKey: key, backdated: false };
  }
  return { ok: true, date: dateFromDateKey(key), dateKey: key, backdated: true };
}
