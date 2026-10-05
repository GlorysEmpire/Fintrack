/**
 * Recording, editing and deleting transactions.
 *
 * Product rules enforced here, on the server, whatever a client sends:
 *
 *  - A bucket is blocked at zero. An expense that is more than its bucket has
 *    available is refused and nothing is saved. The user is told what is
 *    available against what they asked for, and is never pointed at another
 *    bucket: that would defeat the discipline the buckets exist for.
 *  - A transaction can be filed under today or an earlier day, never a later one.
 *  - Created → Editable window → Locked. A transaction can be edited or
 *    deleted for a fixed time after it was recorded (createdAt, which only
 *    the server sets). After that both are refused.
 *  - Every read and write is scoped to the signed-in user's id.
 */
import type { Transaction } from "@prisma/client";
import {
  EXPENSE_CATEGORIES,
  LOCKED_EXPLANATION,
  MONEY_EPSILON,
  amountInBase,
  dateKeyInTimeZone,
  expenseFriction,
  formatMoney,
  isCrossBucket,
  monthKeyOf,
  resolveTransactionDate,
  transactionLockState,
  type CurrencyCode,
  type ExpenseFriction,
  type MoneyTx,
} from "@fintrack/domain";
import { prisma } from "./db";
import { APP_TIME_ZONE } from "./format-date";
import { createOverrideInboxMessage } from "./inbox";
import { parseFx } from "./money";
import { getUserPlan } from "./plan";

export type SessionUser = {
  id: string;
  baseCurrency: string;
  fxRates: string;
};

export type NewTransactionInput = {
  type: "i" | "e";
  amount: number;
  currency: CurrencyCode;
  bucketId?: string | null;
  sourceId?: string | null;
  category?: string | null;
  note?: string | null;
  reason?: string | null;
  /** "YYYY-MM-DD" in the app's time zone. Omitted = now. */
  date?: string | null;
};

/** Fields that may change while a transaction is still editable. The type may not. */
export type TransactionPatch = Partial<Omit<NewTransactionInput, "type">>;

/** Why an expense was refused: the bucket does not hold enough */
export type BucketShortfall = {
  bucketId: string;
  bucketName: string;
  /** What the bucket has available for that date (base currency, never below 0) */
  available: number;
  /** What the expense asked for (base currency) */
  requested: number;
};

export type TransactionResult =
  | { status: "ok"; transaction: Transaction; crossBucket: boolean }
  | { status: "invalid"; error: string; crossBucket?: boolean }
  | { status: "blocked"; error: string; shortfall: BucketShortfall }
  | { status: "locked"; error: string; editableUntil: string }
  | { status: "not_found" };

const CATEGORY_IDS = new Set(EXPENSE_CATEGORIES.map((c) => c.id));

function clean(text: string | null | undefined): string {
  return (text ?? "").trim();
}

function invalid(error: string, extra: { crossBucket?: boolean } = {}) {
  return { status: "invalid" as const, error, ...extra };
}

/** The user's whole history as the domain reads it, optionally leaving one row out. */
async function loadHistory(userId: string, exceptId?: string): Promise<MoneyTx[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    select: {
      id: true,
      type: true,
      amount: true,
      currency: true,
      bucketId: true,
      sourceId: true,
      date: true,
    },
  });
  return rows
    .filter((t) => t.id !== exceptId)
    .map((t) => ({
      type: t.type as "i" | "e",
      amount: t.amount,
      currency: t.currency,
      bucketId: t.bucketId,
      sourceId: t.sourceId,
      date: t.date,
    }));
}

async function ownsSource(userId: string, sourceId: string): Promise<boolean> {
  const source = await prisma.incomeSource.findFirst({
    where: { id: sourceId, userId },
    select: { id: true },
  });
  return Boolean(source);
}

type ExpenseCheck =
  | { ok: false; result: TransactionResult }
  | {
      ok: true;
      bucketId: string | null;
      bucketName: string;
      category: string | null;
      note: string;
      reason: string;
      cross: boolean;
      /** null when the money side was not re-checked (an edit that did not touch it) */
      friction: ExpenseFriction | null;
    };

/**
 * Everything an expense has to pass before it is written.
 * `previous` is the stored row when editing; unchanged values are not re-argued.
 */
async function checkExpense(
  user: SessionUser,
  want: {
    amount: number;
    currency: string;
    bucketId: string | null;
    category: string | null;
    note: string;
    reason: string;
    date: Date;
  },
  opts: {
    now: Date;
    previous?: Transaction;
    /** false when an edit left amount, currency, bucket and day alone */
    moneyChanged: boolean;
  }
): Promise<ExpenseCheck> {
  const plan = await getUserPlan(user.id);
  const previous = opts.previous;

  if (want.category !== null && !CATEGORY_IDS.has(want.category)) {
    return { ok: false, result: invalid("Pick a category from the list.") };
  }

  // No plan yet: the expense still logs, it just belongs to no bucket.
  if (!plan) {
    return {
      ok: true,
      bucketId: null,
      bucketName: "",
      category: want.category,
      note: want.note,
      reason: want.reason,
      cross: false,
      friction: null,
    };
  }

  if (!want.bucketId) {
    return { ok: false, result: invalid("Pick a bucket for this expense.") };
  }
  const bucket = plan.buckets.find((b) => b.id === want.bucketId);
  const keepsOldBucket = previous?.bucketId === want.bucketId;
  if (!bucket || (bucket.archived && !keepsOldBucket)) {
    return {
      ok: false,
      result: invalid(
        bucket?.archived
          ? `${bucket.name} is archived, so new spending can not be recorded against it.`
          : "Pick one of the buckets in your plan."
      ),
    };
  }

  const cross =
    want.category !== null && isCrossBucket(want.bucketId, want.category);
  if (cross && !want.note && !want.reason) {
    return {
      ok: false,
      result: invalid(
        "Cross-bucket spend blocked. Write a reason in the Note field, or choose a matching category.",
        { crossBucket: true }
      ),
    };
  }

  let friction: ExpenseFriction | null = null;
  if (opts.moneyChanged) {
    const fx = parseFx(user.fxRates);
    const amountBase = amountInBase(
      want.amount,
      want.currency,
      user.baseCurrency,
      fx
    );
    friction = expenseFriction({
      amountBase,
      bucketId: want.bucketId,
      plan,
      txs: await loadHistory(user.id, previous?.id),
      base: user.baseCurrency,
      fx,
      date: want.date,
      now: opts.now,
    });

    // An edit that only lowers the amount (same bucket, same month) takes less
    // from the bucket than before, so it is always allowed, even when the
    // bucket is already below zero for another reason.
    const onlyLowers =
      previous !== undefined &&
      keepsOldBucket &&
      monthKeyOf(previous.date) === monthKeyOf(want.date) &&
      amountBase <=
        amountInBase(previous.amount, previous.currency, user.baseCurrency, fx) +
          MONEY_EPSILON;

    // Blocked at zero: the bucket does not hold what was asked for.
    if (friction.blocked && !onlyLowers) {
      return {
        ok: false,
        result: {
          status: "blocked",
          // The domain sentence names an active bucket; an archived one (only
          // reachable when editing) is named here.
          error: `${friction.message.replace(/^This bucket/, bucket.name)} ${
            previous ? "Nothing was changed." : "Nothing was recorded."
          }`,
          shortfall: {
            bucketId: bucket.id,
            bucketName: bucket.name,
            available: Math.max(0, friction.remaining),
            requested: amountBase,
          },
        },
      };
    }
  }

  return {
    ok: true,
    bucketId: bucket.id,
    bucketName: bucket.name,
    category: want.category,
    note: want.note,
    reason: want.reason || (cross ? want.note : ""),
    cross,
    friction,
  };
}

/** Inbox accountability for a cross-bucket spend that was just saved. */
async function writeOverrideNote(
  user: SessionUser,
  tx: Transaction,
  check: Extract<ExpenseCheck, { ok: true }>,
  wasOverride: boolean
) {
  if (!tx.override || wasOverride) return;
  const base = user.baseCurrency as CurrencyCode;
  await createOverrideInboxMessage({
    userId: user.id,
    txId: tx.id,
    bucketName: check.bucketName,
    amountLabel: formatMoney(tx.amount, tx.currency as CurrencyCode),
    reason: check.reason || check.note,
    remainingLabel: formatMoney(
      Math.max(0, check.friction?.remaining ?? 0),
      base
    ),
  });
}

export async function createTransaction(
  user: SessionUser,
  input: NewTransactionInput,
  now: Date = new Date()
): Promise<TransactionResult> {
  const when = resolveTransactionDate({
    dateKey: input.date,
    timeZone: APP_TIME_ZONE,
    now,
  });
  if (!when.ok) return invalid(when.error);

  // Income: optional source; no friction
  if (input.type === "i") {
    const sourceId = input.sourceId || null;
    if (sourceId && !(await ownsSource(user.id, sourceId))) {
      return invalid("Pick one of your income sources.");
    }
    const transaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "i",
        amount: input.amount,
        currency: input.currency,
        sourceId,
        note: clean(input.note) || null,
        date: when.date,
      },
    });
    return { status: "ok", transaction, crossBucket: false };
  }

  const check = await checkExpense(
    user,
    {
      amount: input.amount,
      currency: input.currency,
      bucketId: input.bucketId || null,
      category: input.category || null,
      note: clean(input.note),
      reason: clean(input.reason),
      date: when.date,
    },
    { now, moneyChanged: true }
  );
  if (!check.ok) return check.result;

  const transaction = await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "e",
      amount: input.amount,
      currency: input.currency,
      bucketId: check.bucketId,
      category: check.category,
      note: check.note || null,
      reason: check.reason || null,
      override: check.cross,
      date: when.date,
    },
  });

  await writeOverrideNote(user, transaction, check, false);
  return { status: "ok", transaction, crossBucket: check.cross };
}

export async function updateTransaction(
  user: SessionUser,
  id: string,
  patch: TransactionPatch,
  now: Date = new Date()
): Promise<TransactionResult> {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return { status: "not_found" };

  const lock = transactionLockState(existing.createdAt, now);
  if (lock.locked) {
    return {
      status: "locked",
      error: LOCKED_EXPLANATION,
      editableUntil: lock.editableUntil.toISOString(),
    };
  }

  // The day only changes if the user picked a different one; otherwise the
  // original moment (and its time of day) is kept exactly.
  let date = existing.date;
  if (patch.date != null && patch.date !== "") {
    const when = resolveTransactionDate({
      dateKey: patch.date,
      timeZone: APP_TIME_ZONE,
      now,
    });
    if (!when.ok) return invalid(when.error);
    if (when.dateKey !== dateKeyInTimeZone(existing.date, APP_TIME_ZONE)) {
      date = when.date;
    }
  }

  const amount = patch.amount ?? existing.amount;
  const currency = patch.currency ?? existing.currency;
  const note =
    patch.note !== undefined ? clean(patch.note) : clean(existing.note);

  if (existing.type === "i") {
    const sourceId =
      patch.sourceId !== undefined ? patch.sourceId || null : existing.sourceId;
    if (
      sourceId &&
      sourceId !== existing.sourceId &&
      !(await ownsSource(user.id, sourceId))
    ) {
      return invalid("Pick one of your income sources.");
    }
    const transaction = await prisma.transaction.update({
      where: { id: existing.id, userId: user.id },
      data: { amount, currency, sourceId, note: note || null, date },
    });
    return { status: "ok", transaction, crossBucket: false };
  }

  const bucketId =
    patch.bucketId !== undefined ? patch.bucketId || null : existing.bucketId;
  const category =
    patch.category !== undefined ? patch.category || null : existing.category;
  const reason =
    patch.reason !== undefined ? clean(patch.reason) : clean(existing.reason);
  const moneyChanged =
    amount !== existing.amount ||
    currency !== existing.currency ||
    bucketId !== existing.bucketId ||
    date.getTime() !== existing.date.getTime();

  const check = await checkExpense(
    user,
    { amount, currency, bucketId, category, note, reason, date },
    { now, previous: existing, moneyChanged }
  );
  if (!check.ok) return check.result;

  const transaction = await prisma.transaction.update({
    where: { id: existing.id, userId: user.id },
    data: {
      amount,
      currency,
      bucketId: check.bucketId,
      category: check.category,
      note: check.note || null,
      reason: check.reason || null,
      override: check.cross,
      date,
    },
  });

  await writeOverrideNote(user, transaction, check, existing.override);
  return { status: "ok", transaction, crossBucket: check.cross };
}

export async function deleteTransaction(
  user: SessionUser,
  id: string,
  now: Date = new Date()
): Promise<TransactionResult | { status: "deleted" }> {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return { status: "not_found" };

  const lock = transactionLockState(existing.createdAt, now);
  if (lock.locked) {
    return {
      status: "locked",
      error: LOCKED_EXPLANATION,
      editableUntil: lock.editableUntil.toISOString(),
    };
  }

  // The Inbox notes about this transaction go with it: it was a mistaken log.
  await prisma.$transaction([
    prisma.inboxMessage.deleteMany({
      where: { userId: user.id, relatedTxId: existing.id },
    }),
    prisma.transaction.deleteMany({
      where: { id: existing.id, userId: user.id },
    }),
  ]);
  return { status: "deleted" };
}
