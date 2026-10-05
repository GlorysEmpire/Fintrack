/**
 * Recording, editing and deleting transactions.
 *
 * Product rules enforced here, on the server, whatever a client sends:
 *
 *  - Reality is always recordable. An expense that is more than its bucket
 *    holds is never refused and never trimmed to fit. It is saved once the
 *    user has been warned and has confirmed (confirmOverspend), flagged as an
 *    overspend, and noted in the Inbox.
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
  amountInBase,
  dateKeyInTimeZone,
  expenseFriction,
  formatMoney,
  isCrossBucket,
  resolveTransactionDate,
  transactionLockState,
  type CurrencyCode,
  type ExpenseFriction,
  type MoneyTx,
} from "@fintrack/domain";
import { prisma } from "./db";
import { APP_TIME_ZONE } from "./format-date";
import {
  createOverrideInboxMessage,
  createOverspendInboxMessage,
} from "./inbox";
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
  /** Set only after the user has seen the overspend warning and agreed */
  confirmOverspend?: boolean;
};

/** Fields that may change while a transaction is still editable. The type may not. */
export type TransactionPatch = Partial<
  Omit<NewTransactionInput, "type" | "confirmOverspend">
> & { confirmOverspend?: boolean };

export type OverspendWarning = {
  bucketId: string;
  bucketName: string;
  /** What the bucket could cover before this expense (base currency) */
  remaining: number;
  /** How much of the expense it can not cover */
  overBy: number;
  /** The bucket's balance if the expense is saved */
  remainingAfter: number;
};

export type TransactionResult =
  | {
      status: "ok";
      transaction: Transaction;
      overspend: boolean;
      crossBucket: boolean;
    }
  | { status: "invalid"; error: string; crossBucket?: boolean }
  | { status: "needs_confirmation"; message: string; overspend: OverspendWarning }
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
    confirmOverspend: boolean;
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
          ? `${bucket.name} is archived, so new spending can not be recorded against it. Pick an active bucket.`
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
  if (opts.moneyChanged && !bucket.archived) {
    const fx = parseFx(user.fxRates);
    friction = expenseFriction({
      amountBase: amountInBase(want.amount, want.currency, user.baseCurrency, fx),
      bucketId: want.bucketId,
      plan,
      txs: await loadHistory(user.id, previous?.id),
      base: user.baseCurrency,
      fx,
      date: want.date,
      now: opts.now,
    });

    // Warn → explain → confirm. Never a refusal.
    if (friction.requiresConfirmation && !opts.confirmOverspend) {
      return {
        ok: false,
        result: {
          status: "needs_confirmation",
          message: friction.message,
          overspend: {
            bucketId: bucket.id,
            bucketName: bucket.name,
            remaining: friction.remaining,
            overBy: friction.overBy,
            remainingAfter: friction.remainingAfter,
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

/** Inbox accountability for an expense that was just saved. One note at most. */
async function writeAccountabilityNote(
  user: SessionUser,
  tx: Transaction,
  check: Extract<ExpenseCheck, { ok: true }>,
  was: { overspend: boolean; override: boolean }
) {
  const base = user.baseCurrency as CurrencyCode;
  const amountLabel = formatMoney(tx.amount, tx.currency as CurrencyCode);

  if (tx.overspend && !was.overspend && check.friction) {
    await createOverspendInboxMessage({
      userId: user.id,
      txId: tx.id,
      bucketName: check.bucketName,
      amountLabel,
      availableLabel: formatMoney(Math.max(0, check.friction.remaining), base),
      overByLabel: formatMoney(Math.max(0, -check.friction.remainingAfter), base),
      reason: check.reason || check.note,
    });
    return;
  }
  if (tx.override && !was.override) {
    await createOverrideInboxMessage({
      userId: user.id,
      txId: tx.id,
      bucketName: check.bucketName,
      amountLabel,
      reason: check.reason || check.note,
      remainingLabel: formatMoney(
        Math.max(0, check.friction?.remaining ?? 0),
        base
      ),
    });
  }
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
    return { status: "ok", transaction, overspend: false, crossBucket: false };
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
    { confirmOverspend: Boolean(input.confirmOverspend), now, moneyChanged: true }
  );
  if (!check.ok) return check.result;

  const overspend = Boolean(check.friction?.wouldOverspend);
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
      overspend,
      date: when.date,
    },
  });

  await writeAccountabilityNote(user, transaction, check, {
    overspend: false,
    override: false,
  });
  return { status: "ok", transaction, overspend, crossBucket: check.cross };
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
    return { status: "ok", transaction, overspend: false, crossBucket: false };
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
    {
      confirmOverspend: Boolean(patch.confirmOverspend),
      now,
      previous: existing,
      moneyChanged,
    }
  );
  if (!check.ok) return check.result;

  // Money side untouched → the overspend flag stays as it was recorded.
  const overspend = check.friction
    ? check.friction.wouldOverspend
    : existing.overspend;
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
      overspend,
      date,
    },
  });

  await writeAccountabilityNote(user, transaction, check, {
    overspend: existing.overspend,
    override: existing.override,
  });
  return { status: "ok", transaction, overspend, crossBucket: check.cross };
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
