/**
 * The shape of a transaction as screens receive it (dates as ISO strings).
 * Type-only on the Prisma side, so client components can import this file.
 */
import type { Transaction } from "@prisma/client";

export type TxRow = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  bucketId: string | null;
  sourceId: string | null;
  /** The account it was recorded against, or null (not assigned) */
  accountId: string | null;
  category: string | null;
  note: string | null;
  reason: string | null;
  /** Spent on a category that does not match the bucket (with a written reason) */
  override: boolean;
  /** When it happened */
  date: string;
  /** When it was recorded: the edit window runs from here */
  createdAt: string;
};

export function toTxRow(t: Transaction): TxRow {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    currency: t.currency,
    bucketId: t.bucketId,
    sourceId: t.sourceId,
    accountId: t.accountId,
    category: t.category,
    note: t.note,
    reason: t.reason,
    override: t.override,
    date: t.date.toISOString(),
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * A transaction as an API response: the same fields as always. The exact
 * whole-minor-unit amount (a BigInt, which JSON can not carry) stays on the server.
 */
export function publicTransaction<T extends { amountMinor?: bigint | null }>(t: T): Omit<T, "amountMinor"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { amountMinor: _exact, ...rest } = t;
  return rest;
}
