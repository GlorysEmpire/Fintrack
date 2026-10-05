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
  category: string | null;
  note: string | null;
  reason: string | null;
  /** Spent on a category that does not match the bucket (with a written reason) */
  override: boolean;
  /** More than the bucket held; the user confirmed it after being warned */
  overspend: boolean;
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
    category: t.category,
    note: t.note,
    reason: t.reason,
    override: t.override,
    overspend: t.overspend,
    date: t.date.toISOString(),
    createdAt: t.createdAt.toISOString(),
  };
}
