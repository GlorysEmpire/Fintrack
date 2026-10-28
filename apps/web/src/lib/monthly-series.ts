import { toBase, type CurrencyCode } from "@fintrack/domain";

export type SeriesTx = { type: string; amount: number; currency: string; date: string };
export type MonthPoint = { key: string; label: string; income: number; expenses: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Income and expenses per calendar month (UTC, like the server's month
 * boundaries) for the `count` months ending with the one containing `now`,
 * oldest first. Months with nothing logged are included as zeros.
 */
export function monthlySeries(
  rows: SeriesTx[],
  base: CurrencyCode,
  fx: Record<string, number>,
  count: number,
  now: Date
): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    points.push({
      key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`,
      label: MONTHS[d.getUTCMonth()],
      income: 0,
      expenses: 0,
    });
  }
  const byKey = new Map(points.map((p) => [p.key, p]));
  for (const t of rows) {
    const d = new Date(t.date);
    const p = byKey.get(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
    if (!p) continue;
    const amount = toBase(t.amount, t.currency as CurrencyCode, base, fx);
    if (t.type === "i") p.income += amount;
    else if (t.type === "e") p.expenses += amount;
  }
  return points;
}
