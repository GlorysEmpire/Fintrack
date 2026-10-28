/**
 * Reviewing what the bank reported: the only way an import becomes part of the
 * user's financial history.
 *
 *  - accept  → a real transaction, recorded through the SAME rules as one typed
 *              by hand (the bucket is blocked at zero, the account must be open
 *              and in the right currency, and so on). A refused import stays in
 *              the queue with the reason; it is never forced through.
 *  - match   → it IS a transaction the person already entered: link them, change
 *              neither. No duplicate is created.
 *  - ignore  → not wanted (a duplicate, or not theirs). Can be reopened.
 *
 * Only posted imports can be accepted or matched. Everything is user-scoped,
 * runs under the user's lock, and is safe to repeat: the database allows one
 * transaction per import (Transaction.importId) and one import per transaction
 * (ImportedTransaction.transactionId).
 */
import {
  APP_TIME_ZONE,
  dateKeyInTimeZone,
  fromMinor,
  suggestMatches,
  type CurrencyCode,
} from "@fintrack/domain";
import { prisma } from "../db";
import {
  createTransactionWithinLock,
  type BucketShortfall,
  type SessionUser,
} from "../transactions";
import { withUserLock } from "../user-lock";

export type ImportView = {
  id: string;
  accountId: string;
  accountName: string;
  status: string;
  /** Signed major units: money in is positive */
  amount: number;
  currency: string;
  date: string;
  description: string | null;
  counterparty: string | null;
  review: string;
  attention: string | null;
  suggestions: { transactionId: string; amount: number; date: string; note: string | null; daysApart: number }[];
};

export type ReviewResult =
  | { status: "ok" }
  | { status: "invalid"; error: string }
  | { status: "blocked"; error: string; shortfall: BucketShortfall }
  | { status: "not_found" };

const invalid = (error: string): ReviewResult => ({ status: "invalid", error });

/** What still needs a decision, or has changed at the bank since the person decided */
export async function listImports(userId: string): Promise<ImportView[]> {
  const [imports, accounts, txs] = await Promise.all([
    prisma.importedTransaction.findMany({ where: { userId }, orderBy: { occurredAt: "desc" } }),
    prisma.account.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.transaction.findMany({
      where: { userId, accountId: { not: null } },
      select: { id: true, accountId: true, type: true, amount: true, currency: true, date: true, note: true, importId: true },
    }),
  ]);
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  const claimed = new Set(imports.map((i) => i.transactionId).filter(Boolean) as string[]);

  return imports
    .filter((i) => i.review === "new" || i.attention)
    .slice(0, 200)
    .map((i) => {
      const dayKey = dateKeyInTimeZone(i.occurredAt, APP_TIME_ZONE);
      const suggestions =
        i.review === "new" && i.status === "posted"
          ? suggestMatches(
              { accountId: i.accountId, currency: i.currency, amountMinor: Number(i.amountMinor), dayKey },
              txs.map((t) => ({
                id: t.id,
                accountId: t.accountId,
                type: t.type as "i" | "e",
                amount: t.amount,
                currency: t.currency,
                dayKey: dateKeyInTimeZone(t.date, APP_TIME_ZONE),
                linked: claimed.has(t.id) || Boolean(t.importId),
              }))
            ).map((m) => {
              const t = txs.find((x) => x.id === m.transactionId)!;
              return {
                transactionId: m.transactionId,
                amount: t.type === "i" ? t.amount : -t.amount,
                date: dateKeyInTimeZone(t.date, APP_TIME_ZONE),
                note: t.note,
                daysApart: m.daysApart,
              };
            })
          : [];
      return {
        id: i.id,
        accountId: i.accountId,
        accountName: name.get(i.accountId) ?? "Unknown account",
        status: i.status,
        amount: fromMinor(Number(i.amountMinor)),
        currency: i.currency,
        date: dayKey,
        description: i.description,
        counterparty: i.counterparty,
        review: i.review,
        attention: i.attention,
        suggestions,
      };
    });
}

export type AcceptInput = {
  bucketId?: string | null;
  category?: string | null;
  sourceId?: string | null;
  note?: string | null;
  /** Approve an exception for an expense its bucket can not cover */
  fundFrom?: { bucketId: string; reason: string };
};

export async function acceptImport(
  user: SessionUser,
  id: string,
  input: AcceptInput,
  now: Date = new Date()
): Promise<ReviewResult> {
  return withUserLock(user.id, async () => {
    const imp = await prisma.importedTransaction.findFirst({ where: { id, userId: user.id } });
    if (!imp) return { status: "not_found" };

    // A retry after a crash between "recorded" and "marked": finish the marking, record nothing twice
    const already = await prisma.transaction.findFirst({
      where: { userId: user.id, importId: imp.id },
      select: { id: true },
    });
    if (already) {
      await prisma.importedTransaction.update({
        where: { id: imp.id },
        data: { review: "accepted", transactionId: already.id },
      });
      return { status: "ok" };
    }

    if (imp.review !== "new") return invalid("This one has already been dealt with.");
    if (imp.status === "pending") return invalid("The bank has not posted this yet. Wait until it does.");
    if (imp.status === "reversed") return invalid("The bank reversed this, so there is nothing to record. You can ignore it.");

    const amountMinor = Number(imp.amountMinor);
    const result = await createTransactionWithinLock(
      user,
      {
        type: amountMinor >= 0 ? "i" : "e",
        amount: fromMinor(Math.abs(amountMinor)),
        currency: imp.currency as CurrencyCode,
        bucketId: amountMinor < 0 ? input.bucketId || null : null,
        sourceId: amountMinor >= 0 ? input.sourceId || null : null,
        category: input.category || null,
        note: input.note?.trim() || imp.description || null,
        date: dateKeyInTimeZone(imp.occurredAt, APP_TIME_ZONE),
        accountId: imp.accountId,
        importId: imp.id,
        fundFrom: input.fundFrom,
      },
      now
    );

    if (result.status === "ok") {
      await prisma.importedTransaction.update({
        where: { id: imp.id },
        data: { review: "accepted", transactionId: result.transaction.id, attention: null },
      });
      return { status: "ok" };
    }
    if (result.status === "blocked") {
      return { status: "blocked", error: result.error, shortfall: result.shortfall };
    }
    if (result.status === "invalid") return invalid(result.error);
    return invalid("This could not be recorded.");
  });
}

export async function matchImport(
  userId: string,
  id: string,
  transactionId: string
): Promise<ReviewResult> {
  return withUserLock(userId, async () => {
    const imp = await prisma.importedTransaction.findFirst({ where: { id, userId } });
    if (!imp) return { status: "not_found" };
    if (imp.review !== "new") return invalid("This one has already been dealt with.");
    if (imp.status !== "posted") return invalid("Only a posted bank transaction can be matched.");

    const tx = await prisma.transaction.findFirst({ where: { id: transactionId, userId } });
    if (!tx) return invalid("Pick one of your own transactions.");

    const amountMinor = Number(imp.amountMinor);
    const same =
      tx.accountId === imp.accountId &&
      tx.currency === imp.currency &&
      tx.type === (amountMinor >= 0 ? "i" : "e") &&
      Math.round(tx.amount * 100) === Math.abs(amountMinor);
    if (!same) {
      return invalid("That transaction is not the same account, direction, currency and amount, so it can not be the same event.");
    }
    const taken = await prisma.importedTransaction.findFirst({
      where: { userId, transactionId: tx.id },
      select: { id: true },
    });
    if (taken || tx.importId) return invalid("That transaction is already linked to a bank record.");

    await prisma.importedTransaction.update({
      where: { id: imp.id },
      data: { review: "matched", transactionId: tx.id, attention: null },
    });
    return { status: "ok" };
  });
}

export async function ignoreImport(userId: string, id: string, reopen = false): Promise<ReviewResult> {
  return withUserLock(userId, async () => {
    const imp = await prisma.importedTransaction.findFirst({ where: { id, userId } });
    if (!imp) return { status: "not_found" };
    if (reopen) {
      if (imp.review !== "ignored") return invalid("Only an ignored one can be reopened.");
      await prisma.importedTransaction.update({ where: { id: imp.id }, data: { review: "new" } });
      return { status: "ok" };
    }
    if (imp.review !== "new") return invalid("This one has already been dealt with.");
    await prisma.importedTransaction.update({ where: { id: imp.id }, data: { review: "ignored" } });
    return { status: "ok" };
  });
}

/** The person has seen that the bank changed something they had already recorded */
export async function acknowledgeChange(userId: string, id: string): Promise<ReviewResult> {
  const { count } = await prisma.importedTransaction.updateMany({
    where: { id, userId },
    data: { attention: null },
  });
  return count > 0 ? { status: "ok" } : { status: "not_found" };
}
