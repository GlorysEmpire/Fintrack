/**
 * Inbox messages Steward writes on its own: a heads-up when a bucket is running
 * low or is used up, and a short recap when a month ends. They only state what
 * the numbers are. They never suggest taking money from another bucket, and
 * never praise spending.
 */

export type HeadsUpKind = "low" | "empty";

/** A bucket is "running low" once 15% or less of what it held is left */
export const LOW_BUCKET_SHARE = 0.15;

/**
 * Whether this expense is the one that takes a bucket into "running low" or
 * empties it. It speaks once, at the moment of crossing, never again for the
 * same bucket while it stays low.
 */
export function bucketHeadsUp(opts: { allocated: number; remainingBefore: number; amount: number }): HeadsUpKind | null {
  const { allocated, remainingBefore, amount } = opts;
  if (!(allocated > 0) || !(amount > 0) || remainingBefore <= 0.005) return null;
  const after = remainingBefore - amount;
  if (after <= 0.005) return "empty";
  const wasAbove = remainingBefore / allocated > LOW_BUCKET_SHARE;
  const nowLow = after / allocated <= LOW_BUCKET_SHARE;
  return wasAbove && nowLow ? "low" : null;
}

export function headsUpDraft(
  kind: HeadsUpKind,
  opts: { bucketName: string; leftLabel: string; ofLabel: string; daysLeft: number; perDayLabel: string | null }
): { title: string; body: string } {
  if (kind === "empty") {
    return {
      title: `${opts.bucketName} is used up`,
      body: `You have spent all of this month's ${opts.bucketName} (${opts.ofLabel}).\n\nIt will have money again when more income is allocated to it. Nothing to fix: this is your plan doing its job.\n\n— FinTrack Steward`,
    };
  }
  const pace =
    opts.perDayLabel && opts.daysLeft > 0
      ? `\n\nThat is about ${opts.perDayLabel} a day for the ${opts.daysLeft} ${opts.daysLeft === 1 ? "day" : "days"} left this month.`
      : "";
  return {
    title: `${opts.bucketName} is running low`,
    body: `${opts.bucketName} has ${opts.leftLabel} left of ${opts.ofLabel}.${pace}\n\n— FinTrack Steward`,
  };
}

export function monthlyRecapDraft(opts: {
  monthLabel: string;
  incomeLabel: string;
  expensesLabel: string;
  /** income minus expenses */
  net: number;
  netLabel: string;
  /** expenses as a whole percent of income; null when no income was logged */
  expenseRate: number | null;
}): { title: string; body: string } {
  const outcome =
    opts.net >= 0
      ? `You kept ${opts.netLabel} of what you logged.`
      : `You spent ${opts.netLabel} more than you logged.`;
  const rate = opts.expenseRate === null ? "" : ` Your expenses were ${opts.expenseRate}% of your income.`;
  return {
    title: `Your ${opts.monthLabel} recap`,
    body: `In ${opts.monthLabel} you logged ${opts.incomeLabel} of income and ${opts.expensesLabel} of expenses. ${outcome}${rate}\n\nThese are plain totals from what you recorded. See Trends for the month-by-month picture.\n\n— FinTrack Steward`,
  };
}
