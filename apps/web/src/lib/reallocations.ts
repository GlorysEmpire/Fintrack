/**
 * Approved bucket exceptions.
 *
 * When an expense needs more than its bucket holds, the user may fund the
 * shortfall from another bucket: explicitly, with a reason, for exactly the
 * shortfall. The expense stays in its own bucket (it is what happened); the
 * move is recorded beside it and shows everywhere as a deviation from the plan.
 * A move exists only together with the expense it funded (one-to-one, removed
 * with it), so buckets can never be topped up artificially.
 */
import { fromMinor, type MoneyTx } from "@fintrack/domain";
import { prisma } from "./db";

/** The moves as the bucket maths reads them (type "m": never income, never spending) */
export async function reallocationTxs(
  userId: string,
  range: { since?: Date; before?: Date } = {}
): Promise<MoneyTx[]> {
  const rows = await prisma.reallocation.findMany({
    where: {
      userId,
      ...(range.since || range.before
        ? { date: { ...(range.since ? { gte: range.since } : {}), ...(range.before ? { lt: range.before } : {}) } }
        : {}),
    },
  });
  return rows.map((r) => ({
    type: "m" as const,
    amount: fromMinor(Number(r.amountMinor)),
    currency: r.currency,
    bucketId: r.toBucketId,
    fromBucketId: r.fromBucketId,
    date: r.date,
  }));
}

export type DeviationView = {
  id: string;
  date: string;
  /** Major units, in the currency the move was approved in */
  amount: number;
  currency: string;
  fromBucketId: string;
  toBucketId: string;
  fromProtected: boolean;
  reason: string;
  transactionId: string;
  /** What the expense was, for the audit trail */
  expenseNote: string | null;
  expenseAmount: number | null;
  expenseCurrency: string | null;
};

/** Every approved exception, newest first: what was funded, from where, and why */
export async function listDeviations(userId: string, limit = 100): Promise<DeviationView[]> {
  const [rows, txs] = await Promise.all([
    prisma.reallocation.findMany({ where: { userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: limit }),
    prisma.transaction.findMany({
      where: { userId, importId: undefined },
      select: { id: true, note: true, amount: true, currency: true },
    }),
  ]);
  const byId = new Map(txs.map((t) => [t.id, t]));
  return rows.map((r) => {
    const t = byId.get(r.transactionId);
    return {
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      amount: fromMinor(Number(r.amountMinor)),
      currency: r.currency,
      fromBucketId: r.fromBucketId,
      toBucketId: r.toBucketId,
      fromProtected: r.fromProtected,
      reason: r.reason,
      transactionId: r.transactionId,
      expenseNote: t?.note ?? null,
      expenseAmount: t?.amount ?? null,
      expenseCurrency: t?.currency ?? null,
    };
  });
}
