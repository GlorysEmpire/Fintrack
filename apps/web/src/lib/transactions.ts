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
  bucketAvailableOn,
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
import { randomUUID } from "node:crypto";
import { checkAccountForEvent } from "./accounts";
import { prisma } from "./db";
import { reallocationTxs } from "./reallocations";
import { APP_TIME_ZONE } from "./format-date";
import { createOverrideInboxMessage } from "./inbox";
import { parseFx } from "./money";
import { getUserPlan } from "./plan";
import { withUserLock } from "./user-lock";

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
  /** The account the money went into or came out of. Omitted = not assigned. */
  accountId?: string | null;
  /**
   * Set only by the recurring job (never accepted from a request body): which
   * occurrence of which rule this is. The database refuses a second one.
   */
  recurring?: { ruleId: string; occurrenceDate: Date };
  /**
   * Approve an exception: fund what this expense is short by from another
   * bucket. Only ever used after the user was shown the shortfall and chose.
   */
  fundFrom?: FundFrom;
  /**
   * Set only by the bank-import review: the import this transaction is created
   * from. Unique in the database, so one import can never become two transactions.
   */
  importId?: string;
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
  /** How much is missing (base currency): what an approved exception would have to fund */
  short: number;
  /** Other buckets that could fund exactly that shortfall, for the user to choose from */
  options: { bucketId: string; name: string; available: number; protected: boolean }[];
};

/** The user's explicit decision to fund a shortfall from another bucket */
export type FundFrom = { bucketId: string; reason: string };

export type TransactionResult =
  | { status: "ok"; transaction: Transaction; crossBucket: boolean }
  | { status: "invalid"; error: string; crossBucket?: boolean }
  | { status: "blocked"; error: string; shortfall: BucketShortfall }
  | { status: "locked"; error: string; editableUntil: string }
  | { status: "not_found" };

/** A transfer's fee is part of that transfer, so it is changed only through it. */
const TRANSFER_FEE_MESSAGE =
  "This is the fee for a transfer. It can only be removed by deleting the transfer.";

const CATEGORY_IDS = new Set(EXPENSE_CATEGORIES.map((c) => c.id));

function clean(text: string | null | undefined): string {
  return (text ?? "").trim();
}

function invalid(error: string, extra: { crossBucket?: boolean } = {}) {
  return { status: "invalid" as const, error, ...extra };
}

/** The user's whole history as the domain reads it, optionally leaving one row out. */
async function loadHistory(userId: string, exceptId?: string): Promise<MoneyTx[]> {
  const moves = await reallocationTxs(userId);
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
  return [
    ...rows
      .filter((t) => t.id !== exceptId)
      .map((t) => ({
        type: t.type as "i" | "e",
        amount: t.amount,
        currency: t.currency,
        bucketId: t.bucketId,
        sourceId: t.sourceId,
        date: t.date,
      })),
    ...moves,
  ];
}

async function ownsSource(userId: string, sourceId: string): Promise<boolean> {
  const source = await prisma.incomeSource.findFirst({
    where: { id: sourceId, userId },
    select: { id: true },
  });
  return Boolean(source);
}

export type ExpenseCheck =
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
      /** An approved exception funding the shortfall, when the user chose one */
      reallocation: {
        fromBucketId: string;
        toBucketId: string;
        amountBase: number;
        reason: string;
        fromProtected: boolean;
      } | null;
    };

/**
 * Everything an expense has to pass before it is written.
 * `previous` is the stored row when editing; unchanged values are not re-argued.
 */
export async function checkExpense(
  user: SessionUser,
  want: {
    amount: number;
    currency: string;
    bucketId: string | null;
    category: string | null;
    note: string;
    reason: string;
    date: Date;
    fundFrom?: FundFrom;
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
      reallocation: null,
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
      const history = await loadHistory(user.id, previous?.id);
      const short = Math.max(0, amountBase - Math.max(0, friction.remaining));
      const candidates = plan.buckets
        .filter((b) => !b.archived && b.id !== bucket.id)
        .map((b) => ({
          bucketId: b.id,
          name: b.name,
          protected: b.carryOver,
          available: Math.max(
            0,
            bucketAvailableOn(history, plan, user.baseCurrency, parseFx(user.fxRates), b.id, want.date, opts.now)
          ),
        }));
      const options = candidates.filter((c) => c.available + MONEY_EPSILON >= short);

      // The user already chose where the extra money comes from: check that choice
      if (want.fundFrom && !previous) {
        const source = candidates.find((c) => c.bucketId === want.fundFrom!.bucketId);
        const reason = want.fundFrom.reason.trim();
        if (!source) {
          return { ok: false, result: invalid("Pick another bucket in your plan to fund this.") };
        }
        if (reason.length < 3) {
          return { ok: false, result: invalid("Write why you are funding this from another bucket.") };
        }
        if (source.available + MONEY_EPSILON < short) {
          return {
            ok: false,
            result: invalid(
              `${source.name} has ${formatMoney(source.available, user.baseCurrency as CurrencyCode)} available, which does not cover the ${formatMoney(short, user.baseCurrency as CurrencyCode)} that is missing. Nothing was recorded.`
            ),
          };
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
          reallocation: {
            fromBucketId: source.bucketId,
            toBucketId: bucket.id,
            amountBase: short,
            reason,
            fromProtected: source.protected,
          },
        };
      }

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
            short,
            // An edit can not take an exception: record it again instead
            options: previous ? [] : options,
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
    reallocation: null,
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

/**
 * Recording an expense reads the bucket's balance and then writes, so it runs
 * under the user's lock: see user-lock.ts. Income takes no money from a bucket.
 */
export async function createTransaction(
  user: SessionUser,
  input: NewTransactionInput,
  now: Date = new Date()
): Promise<TransactionResult> {
  if (input.type === "e") {
    return withUserLock(user.id, () => createUnlocked(user, input, now));
  }
  return createUnlocked(user, input, now);
}

/**
 * Record a transaction when the caller already holds the user's lock (the
 * recurring job does, so it can check for an existing occurrence, record, and
 * move the rule on as one step). Everything else goes through createTransaction.
 */
export const createTransactionWithinLock = (
  user: SessionUser,
  input: NewTransactionInput,
  now: Date = new Date()
) => createUnlocked(user, input, now);

async function createUnlocked(
  user: SessionUser,
  input: NewTransactionInput,
  now: Date
): Promise<TransactionResult> {
  const when = resolveTransactionDate({
    dateKey: input.date,
    timeZone: APP_TIME_ZONE,
    now,
  });
  if (!when.ok) return invalid(when.error);

  const accountId = input.accountId || null;
  if (accountId) {
    const problem = await checkAccountForEvent(user.id, accountId, input.currency, when.date);
    if (problem) return invalid(problem);
  }

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
        accountId,
        importId: input.importId ?? null,
        recurringRuleId: input.recurring?.ruleId ?? null,
        occurrenceDate: input.recurring?.occurrenceDate ?? null,
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
      fundFrom: input.fundFrom,
    },
    { now, moneyChanged: true }
  );
  if (!check.ok) return check.result;

  const id = randomUUID();
  const expenseData = {
    data: {
      id,
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
      accountId,
      importId: input.importId ?? null,
      recurringRuleId: input.recurring?.ruleId ?? null,
      occurrenceDate: input.recurring?.occurrenceDate ?? null,
    },
  };

  let transaction: Transaction;
  if (check.reallocation) {
    // The expense and the exception that funds it are saved together, or not at all
    const r = check.reallocation;
    const [created] = (await prisma.$transaction([
      prisma.transaction.create(expenseData),
      prisma.reallocation.create({
        data: {
          userId: user.id,
          transactionId: id,
          fromBucketId: r.fromBucketId,
          toBucketId: r.toBucketId,
          amountMinor: BigInt(Math.round(r.amountBase * 100)),
          currency: user.baseCurrency,
          date: when.date,
          reason: r.reason,
          fromProtected: r.fromProtected,
        },
      }),
    ])) as [Transaction, unknown];
    transaction = created;
  } else {
    transaction = await prisma.transaction.create(expenseData);
  }

  await writeOverrideNote(user, transaction, check, false);
  return { status: "ok", transaction, crossBucket: check.cross };
}

/** An edit can raise an expense, so it takes the same lock as recording one. */
export async function updateTransaction(
  user: SessionUser,
  id: string,
  patch: TransactionPatch,
  now: Date = new Date()
): Promise<TransactionResult> {
  return withUserLock(user.id, () => updateUnlocked(user, id, patch, now));
}

async function updateUnlocked(
  user: SessionUser,
  id: string,
  patch: TransactionPatch,
  now: Date
): Promise<TransactionResult> {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return { status: "not_found" };
  if (existing.transferId) return invalid(TRANSFER_FEE_MESSAGE);

  const lock = transactionLockState(existing.createdAt, now);
  if (lock.locked) {
    return {
      status: "locked",
      error: LOCKED_EXPLANATION,
      editableUntil: lock.editableUntil.toISOString(),
    };
  }

  // An expense funded by an approved exception keeps its amount, bucket and
  // day: they are what the exception was approved for. Delete it and record it
  // again to change them.
  const changesMoney =
    (patch.amount !== undefined && patch.amount !== existing.amount) ||
    (patch.currency !== undefined && patch.currency !== existing.currency) ||
    (patch.bucketId !== undefined && (patch.bucketId || null) !== existing.bucketId) ||
    (patch.date != null &&
      patch.date !== "" &&
      patch.date !== dateKeyInTimeZone(existing.date, APP_TIME_ZONE));
  if (changesMoney) {
    const funded = await prisma.reallocation.findFirst({
      where: { transactionId: existing.id, userId: user.id },
      select: { id: true },
    });
    if (funded) {
      return invalid(
        "This expense was funded by an approved exception, so its amount, bucket and day can not change. Delete it and record it again."
      );
    }
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

  const accountId =
    patch.accountId !== undefined ? patch.accountId || null : existing.accountId;
  if (
    accountId &&
    (accountId !== existing.accountId ||
      currency !== existing.currency ||
      date.getTime() !== existing.date.getTime())
  ) {
    const problem = await checkAccountForEvent(user.id, accountId, currency, date);
    if (problem) return invalid(problem);
  }

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
      data: { amount, currency, sourceId, note: note || null, date, accountId },
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
      accountId,
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
  if (existing.transferId) return invalid(TRANSFER_FEE_MESSAGE);

  const lock = transactionLockState(existing.createdAt, now);
  if (lock.locked) {
    return {
      status: "locked",
      error: LOCKED_EXPLANATION,
      editableUntil: lock.editableUntil.toISOString(),
    };
  }

  // The Inbox notes about this transaction go with it: it was a mistaken log.
  // A bank import that became (or was matched to) this transaction goes back to
  // the review queue, so the bank's record is not lost with it.
  await prisma.$transaction([
    prisma.reallocation.deleteMany({
      where: { userId: user.id, transactionId: existing.id },
    }),
    prisma.importedTransaction.updateMany({
      where: { userId: user.id, transactionId: existing.id },
      data: { review: "new", transactionId: null },
    }),
    prisma.inboxMessage.deleteMany({
      where: { userId: user.id, relatedTxId: existing.id },
    }),
    prisma.transaction.deleteMany({
      where: { id: existing.id, userId: user.id },
    }),
  ]);
  return { status: "deleted" };
}
