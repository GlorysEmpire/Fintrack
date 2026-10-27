/**
 * Transfers between the user's own accounts.
 *
 * One row is BOTH sides of the movement, so the two sides can not drift apart
 * and creating one is atomic (it either exists or it does not). A transfer is
 * never income and never spending: it appears in no income or expense total.
 * Across currencies the user states what left and what arrived; no conversion
 * is ever assumed.
 *
 * A transfer fee is a real cost, so it is recorded as an ordinary EXPENSE
 * transaction on the source account, linked to the transfer. It therefore
 * counts once as spending, takes money from the account once, and obeys the
 * same rule as any expense: a bucket is blocked at zero, so a fee the chosen
 * bucket can not cover refuses the whole transfer and nothing is saved. The
 * transfer and its fee are written together, all or nothing, and deleting the
 * transfer removes its fee.
 *
 * Moving money here only records that it moved. Nothing leaves FinTrack.
 */
import {
  APP_TIME_ZONE,
  LOCKED_EXPLANATION,
  checkTransfer,
  dateKeyInTimeZone,
  fromMinor,
  resolveTransactionDate,
  transactionLockState,
} from "@fintrack/domain";
import type { PrismaPromise, Transfer } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { checkAccountForEvent } from "./accounts";
import { prisma } from "./db";
import { getUserPlan } from "./plan";
import { checkExpense, type BucketShortfall, type SessionUser } from "./transactions";
import { withUserLock } from "./user-lock";

export type NewTransferInput = {
  fromAccountId: string;
  toAccountId: string;
  /** Major units that left the source account */
  amount: number;
  /** Major units that arrived. Required if the currencies differ. */
  toAmount?: number | null;
  /** What the transfer cost, charged to the source account as an expense */
  fee?: number | null;
  /** The plan bucket the fee is spent from (needed when there is a fee and a plan) */
  feeBucketId?: string | null;
  /** Informational only */
  exchangeRate?: number | null;
  /** "YYYY-MM-DD", today or earlier. Omitted = now. */
  date?: string | null;
  note?: string | null;
  reference?: string | null;
};

export type TransferView = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromAmount: number;
  toAmount: number;
  fee: number;
  exchangeRate: number | null;
  date: string;
  createdAt: string;
  note: string | null;
  reference: string | null;
  status: string;
  /** The edit window has closed */
  locked: boolean;
};

export type TransferResult =
  | { status: "ok"; transfer: TransferView }
  | { status: "invalid"; error: string }
  | { status: "blocked"; error: string; shortfall: BucketShortfall }
  | { status: "locked"; error: string; editableUntil: string }
  | { status: "not_found" };

export function toTransferView(t: Transfer, now: Date = new Date()): TransferView {
  return {
    id: t.id,
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    fromAmount: fromMinor(Number(t.fromAmountMinor)),
    toAmount: fromMinor(Number(t.toAmountMinor)),
    fee: fromMinor(Number(t.feeMinor)),
    exchangeRate: t.exchangeRate,
    date: dateKeyInTimeZone(t.date, APP_TIME_ZONE),
    createdAt: t.createdAt.toISOString(),
    note: t.note,
    reference: t.reference,
    status: t.status,
    locked: transactionLockState(t.createdAt, now).locked,
  };
}

export async function createTransfer(
  user: SessionUser,
  input: NewTransferInput,
  now: Date = new Date()
): Promise<TransferResult> {
  // The fee is checked against a bucket's balance and then written, so this
  // runs under the user's lock like any other expense.
  return withUserLock(user.id, () => createUnlocked(user, input, now));
}

async function createUnlocked(
  user: SessionUser,
  input: NewTransferInput,
  now: Date
): Promise<TransferResult> {
  const userId = user.id;
  const when = resolveTransactionDate({ dateKey: input.date, timeZone: APP_TIME_ZONE, now });
  if (!when.ok) return { status: "invalid", error: when.error };

  const [from, to] = await Promise.all([
    prisma.account.findFirst({ where: { id: input.fromAccountId, userId } }),
    prisma.account.findFirst({ where: { id: input.toAccountId, userId } }),
  ]);
  if (!from || !to) return { status: "invalid", error: "Pick two of your own accounts." };

  const shape = checkTransfer({
    fromAccountId: from.id,
    toAccountId: to.id,
    fromCurrency: from.currency,
    toCurrency: to.currency,
    fromAmount: input.amount,
    toAmount: input.toAmount,
    fee: input.fee,
    exchangeRate: input.exchangeRate,
  });
  if (!shape.ok) return { status: "invalid", error: shape.error };

  // Each side must accept a record on this day, in its own currency
  const fromError = await checkAccountForEvent(userId, from.id, from.currency, when.date);
  if (fromError) return { status: "invalid", error: fromError };
  const toError = await checkAccountForEvent(userId, to.id, to.currency, when.date);
  if (toError) return { status: "invalid", error: toError };

  const id = randomUUID();
  const writes: PrismaPromise<unknown>[] = [
    prisma.transfer.create({
      data: {
        id,
        userId,
        fromAccountId: from.id,
        toAccountId: to.id,
        fromAmountMinor: BigInt(shape.fromAmountMinor),
        toAmountMinor: BigInt(shape.toAmountMinor),
        feeMinor: BigInt(shape.feeMinor),
        exchangeRate: input.exchangeRate ?? null,
        date: when.date,
        note: input.note?.trim() || null,
        reference: input.reference?.trim() || null,
      },
    }),
  ];

  if (shape.feeMinor > 0) {
    // A cost is spending: it must pass the same checks as any expense
    const plan = await getUserPlan(userId);
    if (plan && !input.feeBucketId) {
      return { status: "invalid", error: "Pick the bucket the transfer fee is spent from." };
    }
    const check = await checkExpense(
      user,
      {
        amount: fromMinor(shape.feeMinor),
        currency: from.currency,
        bucketId: input.feeBucketId || null,
        category: null,
        note: `Transfer fee: ${from.name} to ${to.name}`,
        reason: "",
        date: when.date,
      },
      { now, moneyChanged: true }
    );
    if (!check.ok) {
      const result = check.result;
      if (result.status === "blocked") {
        return {
          status: "blocked",
          error: `${result.error} The transfer was not made.`,
          shortfall: result.shortfall,
        };
      }
      if (result.status === "invalid") return { status: "invalid", error: result.error };
      return { status: "invalid", error: "The fee could not be recorded." };
    }
    writes.push(
      prisma.transaction.create({
        data: {
          userId,
          type: "e",
          amount: fromMinor(shape.feeMinor),
          currency: from.currency,
          bucketId: check.bucketId,
          category: null,
          note: check.note || null,
          override: false,
          date: when.date,
          accountId: from.id,
          transferId: id,
        },
      })
    );
  }

  // The transfer and its fee are saved together or not at all
  const [transfer] = (await prisma.$transaction(writes)) as [Transfer];
  return { status: "ok", transfer: toTransferView(transfer, now) };
}

export async function listTransfers(
  userId: string,
  opts: { accountId?: string; limit?: number } = {}
): Promise<TransferView[]> {
  const rows = await prisma.transfer.findMany({
    where: { userId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const now = new Date();
  return rows
    .filter((t) => !opts.accountId || t.fromAccountId === opts.accountId || t.toAccountId === opts.accountId)
    .slice(0, opts.limit ?? 100)
    .map((t) => toTransferView(t, now));
}

/** A mistaken transfer can be deleted during the same edit window as a transaction. */
export async function deleteTransfer(
  userId: string,
  id: string,
  now: Date = new Date()
): Promise<TransferResult | { status: "deleted" }> {
  const existing = await prisma.transfer.findFirst({ where: { id, userId } });
  if (!existing) return { status: "not_found" };
  const lock = transactionLockState(existing.createdAt, now);
  if (lock.locked) {
    return { status: "locked", error: LOCKED_EXPLANATION, editableUntil: lock.editableUntil.toISOString() };
  }
  // The fee expense (if any) goes with its transfer, together or not at all
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { transferId: existing.id, userId } }),
    prisma.transfer.deleteMany({ where: { id: existing.id, userId } }),
  ]);
  return { status: "deleted" };
}
