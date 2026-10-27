/**
 * Financial accounts: where money is held, or where a debt sits.
 *
 * An account answers "where is the money?". It is separate from a plan bucket
 * ("what is the money for?") and from a transaction ("what happened?").
 *
 * Rules enforced here, on the server:
 *  - A balance is never stored. It is derived from the opening balance and the
 *    events dated on or after the opening date (domain/accounts.ts).
 *  - Accounts are archived, never deleted, so history keeps its meaning.
 *  - The opening balance and date can change only until the account has any
 *    activity. After that, a difference is recorded as an adjustment, which is
 *    neither income nor spending.
 *  - Existing transactions are NOT assigned to any account automatically. They
 *    stay "unassigned" until the user chooses (see assignUnassigned).
 *  - Every read and write is scoped to the signed-in user's id.
 */
import {
  ACCOUNT_TYPES,
  APP_TIME_ZONE,
  accountBalances,
  dateFromDateKey,
  dateKeyInTimeZone,
  fromMinor,
  isDateKey,
  kindOfType,
  openingError,
  openingFromLedger,
  openingToLedger,
  toMinor,
  type AccountBalance,
  type AccountKind,
  startOfAppDay,
  type LedgerAccount,
} from "@fintrack/domain";
import type { Account } from "@prisma/client";
import { prisma } from "./db";
import { withUserLock } from "./user-lock";

export const MAX_ACCOUNTS_PER_USER = 50;
const CURRENCIES = ["NGN", "USD", "GBP", "EUR"];

export type NewAccountInput = {
  name: string;
  type: string;
  institution?: string | null;
  currency: string;
  /** Major units. For a debt (card, loan): the amount currently OWED, as a positive number. */
  openingBalance: number;
  /** "YYYY-MM-DD", today or earlier. Omitted = today. */
  openingDate?: string | null;
};

export type AccountPatch = {
  name?: string;
  institution?: string | null;
  /** "active" | "archived" */
  status?: "active" | "archived";
  openingBalance?: number;
  openingDate?: string | null;
};

export type AccountView = {
  id: string;
  name: string;
  kind: AccountKind;
  type: string;
  typeLabel: string;
  institution: string | null;
  currency: string;
  status: string;
  /** What the user typed at the start (a debt as a positive amount owed) */
  openingBalance: number;
  openingDate: string;
  /** Signed money held in major units (a debt is negative) */
  balance: number;
  /** For a debt: what is owed (never negative); 0 for an asset */
  owed: number;
  /** Money in/out so far, to explain the balance */
  income: number;
  expenses: number;
  transfersIn: number;
  transfersOut: number;
  adjustments: number;
  eventCount: number;
  /** An asset below zero usually means a missing record */
  belowZero: boolean;
};

export type AccountResult =
  | { status: "ok"; account: AccountView }
  | { status: "invalid"; error: string }
  | { status: "not_found" };

const invalid = (error: string): AccountResult => ({ status: "invalid", error });

const typeLabel = (type: string) => ACCOUNT_TYPES.find((t) => t.id === type)?.label ?? type;

function toLedgerAccount(a: Account): LedgerAccount {
  return {
    id: a.id,
    kind: a.kind as AccountKind,
    currency: a.currency,
    openingBalanceMinor: Number(a.openingBalanceMinor),
    openingDate: a.openingDate,
  };
}

function toView(a: Account, b: AccountBalance): AccountView {
  const kind = a.kind as AccountKind;
  return {
    id: a.id,
    name: a.name,
    kind,
    type: a.type,
    typeLabel: typeLabel(a.type),
    institution: a.institution,
    currency: a.currency,
    status: a.status,
    openingBalance: fromMinor(openingFromLedger(kind, Number(a.openingBalanceMinor))),
    openingDate: dateKeyInTimeZone(a.openingDate, APP_TIME_ZONE),
    balance: fromMinor(b.balanceMinor),
    owed: fromMinor(b.owedMinor),
    income: fromMinor(b.incomeMinor),
    expenses: fromMinor(b.expenseMinor),
    transfersIn: fromMinor(b.transfersInMinor),
    transfersOut: fromMinor(b.transfersOutMinor),
    adjustments: fromMinor(b.adjustmentsMinor),
    eventCount: b.eventCount,
    belowZero: kind === "asset" && b.balanceMinor < 0,
  };
}

/** Every account with its derived balance, plus how many transactions belong to none. */
export async function listAccounts(userId: string): Promise<{
  accounts: AccountView[];
  unassignedCount: number;
}> {
  const [accounts, txs, transfers, adjustments, unassignedCount] = await Promise.all([
    prisma.account.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { name: "asc" }] }),
    prisma.transaction.findMany({
      where: { userId, accountId: { not: null } },
      select: { accountId: true, type: true, amount: true, currency: true, date: true },
    }),
    prisma.transfer.findMany({ where: { userId } }),
    prisma.accountAdjustment.findMany({ where: { userId } }),
    prisma.transaction.count({ where: { userId, accountId: null } }),
  ]);

  const balances = accountBalances(
    accounts.map(toLedgerAccount),
    txs.map((t) => ({
      accountId: t.accountId,
      type: t.type as "i" | "e",
      amount: t.amount,
      currency: t.currency,
      date: t.date,
    })),
    transfers.map((t) => ({
      fromAccountId: t.fromAccountId,
      toAccountId: t.toAccountId,
      fromAmountMinor: Number(t.fromAmountMinor),
      toAmountMinor: Number(t.toAmountMinor),
      date: t.date,
    })),
    adjustments.map((a) => ({
      accountId: a.accountId,
      amountMinor: Number(a.amountMinor),
      date: a.date,
    }))
  );
  const byId = new Map(balances.map((b) => [b.accountId, b]));
  return {
    accounts: accounts.map((a) => toView(a, byId.get(a.id) as AccountBalance)),
    unassignedCount,
  };
}

async function viewOf(userId: string, id: string): Promise<AccountView | null> {
  const { accounts } = await listAccounts(userId);
  return accounts.find((a) => a.id === id) ?? null;
}

function nameError(name: string): string | null {
  if (name.length < 1) return "Give the account a name.";
  if (name.length > 60) return "Keep the name to 60 characters or fewer.";
  return null;
}

function openingDateFrom(key: string | null | undefined, now: Date): { date: Date } | { error: string } {
  const today = dateKeyInTimeZone(now, APP_TIME_ZONE);
  const k = key || today;
  if (!isDateKey(k)) return { error: "Enter a valid opening date." };
  if (k > today) return { error: "The opening date can not be in the future." };
  if (k < "2000-01-01") return { error: "That opening date is too far in the past." };
  return { date: dateFromDateKey(k) };
}

export async function createAccount(
  userId: string,
  input: NewAccountInput,
  now: Date = new Date()
): Promise<AccountResult> {
  const name = input.name.trim();
  const badName = nameError(name);
  if (badName) return invalid(badName);
  const kind = kindOfType(input.type);
  if (!kind) return invalid("Pick an account type from the list.");
  if (!CURRENCIES.includes(input.currency)) return invalid("Pick a currency from the list.");
  const badOpening = openingError(kind, input.openingBalance);
  if (badOpening) return invalid(badOpening);
  const opened = openingDateFrom(input.openingDate, now);
  if ("error" in opened) return invalid(opened.error);

  if ((await prisma.account.count({ where: { userId } })) >= MAX_ACCOUNTS_PER_USER) {
    return invalid(`You can have up to ${MAX_ACCOUNTS_PER_USER} accounts.`);
  }
  if (await prisma.account.findFirst({ where: { userId, name }, select: { id: true } })) {
    return invalid("You already have an account with that name.");
  }

  const created = await prisma.account.create({
    data: {
      userId,
      name,
      kind,
      type: input.type,
      institution: input.institution?.trim() || null,
      currency: input.currency,
      openingBalanceMinor: BigInt(openingToLedger(kind, toMinor(input.openingBalance))),
      openingDate: opened.date,
    },
  });
  const view = await viewOf(userId, created.id);
  return { status: "ok", account: view as AccountView };
}

export async function updateAccount(
  userId: string,
  id: string,
  patch: AccountPatch,
  now: Date = new Date()
): Promise<AccountResult> {
  return withUserLock(userId, async () => {
    const existing = await prisma.account.findFirst({ where: { id, userId } });
    if (!existing) return { status: "not_found" };
    const kind = existing.kind as AccountKind;
    const data: Record<string, unknown> = {};

    if (patch.name !== undefined) {
      const name = patch.name.trim();
      const bad = nameError(name);
      if (bad) return invalid(bad);
      if (name !== existing.name) {
        const clash = await prisma.account.findFirst({ where: { userId, name }, select: { id: true } });
        if (clash) return invalid("You already have an account with that name.");
      }
      data.name = name;
    }
    if (patch.institution !== undefined) data.institution = patch.institution?.trim() || null;
    if (patch.status !== undefined) data.status = patch.status;

    if (patch.openingBalance !== undefined || patch.openingDate !== undefined) {
      const current = (await viewOf(userId, id)) as AccountView;
      if (current.eventCount > 0) {
        return invalid(
          "This account already has activity, so its opening balance can not be edited. Record an adjustment instead: it keeps the history honest."
        );
      }
      if (patch.openingBalance !== undefined) {
        const bad = openingError(kind, patch.openingBalance);
        if (bad) return invalid(bad);
        data.openingBalanceMinor = BigInt(openingToLedger(kind, toMinor(patch.openingBalance)));
      }
      if (patch.openingDate !== undefined) {
        const opened = openingDateFrom(patch.openingDate, now);
        if ("error" in opened) return invalid(opened.error);
        data.openingDate = opened.date;
      }
    }

    if (Object.keys(data).length > 0) {
      await prisma.account.update({ where: { id }, data });
    }
    return { status: "ok", account: (await viewOf(userId, id)) as AccountView };
  });
}

/**
 * Record that an account's real balance is different from the derived one.
 * The difference becomes an adjustment: neither income nor spending.
 */
export async function adjustBalance(
  userId: string,
  id: string,
  input: { actualBalance: number; note?: string | null },
  now: Date = new Date()
): Promise<AccountResult> {
  return withUserLock(userId, async () => {
    const account = await prisma.account.findFirst({ where: { id, userId } });
    if (!account) return { status: "not_found" };
    if (account.status !== "active") return invalid("This account is archived.");
    const kind = account.kind as AccountKind;
    const bad = openingError(kind, input.actualBalance);
    if (bad) return invalid(bad);

    const current = (await viewOf(userId, id)) as AccountView;
    const targetMinor = openingToLedger(kind, toMinor(input.actualBalance));
    const diffMinor = targetMinor - toMinor(current.balance);
    if (diffMinor === 0) return invalid("The balance already matches. Nothing to adjust.");

    await prisma.accountAdjustment.create({
      data: {
        userId,
        accountId: id,
        amountMinor: BigInt(diffMinor),
        date: now,
        note: input.note?.trim() || null,
      },
    });
    return { status: "ok", account: (await viewOf(userId, id)) as AccountView };
  });
}

/**
 * The one deliberate way to give existing, unassigned transactions an account.
 * The user chooses the account and confirms; nothing else is assumed. Only
 * transactions in the account's currency dated on or after its opening date
 * are included (earlier ones are already inside the opening balance). Only
 * the account is set: amounts, dates and buckets are untouched.
 */
export async function assignUnassigned(
  userId: string,
  id: string
): Promise<{ status: "ok"; assigned: number; skipped: number } | { status: "invalid"; error: string } | { status: "not_found" }> {
  return withUserLock(userId, async () => {
    const account = await prisma.account.findFirst({ where: { id, userId } });
    if (!account) return { status: "not_found" } as const;
    if (account.status !== "active") return { status: "invalid", error: "This account is archived." } as const;

    const total = await prisma.transaction.count({ where: { userId, accountId: null } });
    const { count } = await prisma.transaction.updateMany({
      where: {
        userId,
        accountId: null,
        currency: account.currency,
        date: { gte: startOfAppDay(account.openingDate) },
      },
      data: { accountId: id },
    });
    return { status: "ok", assigned: count, skipped: total - count } as const;
  });
}

/**
 * Whether a transaction or transfer may be recorded against an account.
 * Returns a sentence for the user, or null when it is fine.
 */
export async function checkAccountForEvent(
  userId: string,
  accountId: string,
  currency: string,
  date: Date
): Promise<string | null> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) return "Pick one of your accounts.";
  if (account.status !== "active") {
    return `${account.name} is ${account.status}, so nothing new can be recorded against it.`;
  }
  if (account.currency !== currency) {
    return `${account.name} holds ${account.currency}, but this is in ${currency}.`;
  }
  if (date.getTime() < startOfAppDay(account.openingDate).getTime()) {
    return `${account.name} opened on ${dateKeyInTimeZone(account.openingDate, APP_TIME_ZONE)}. A record dated earlier can not be recorded against it.`;
  }
  return null;
}

export type AccountEvent = {
  kind: "income" | "expense" | "transfer_in" | "transfer_out" | "adjustment";
  date: string;
  /** Effect on the balance, in major units (negative = money out) */
  amount: number;
  /** Balance after this event (a debt is negative) */
  balanceAfter: number;
  note: string | null;
  /** For a transfer: the other account's name */
  counterparty: string | null;
};

/**
 * Everything that moved one account, newest first, with the balance after each
 * event: where the money came from and where it went. Only events that count
 * toward the balance (on or after the opening date) are listed.
 */
export async function accountHistory(
  userId: string,
  id: string,
  limit = 100
): Promise<{ status: "ok"; events: AccountEvent[]; total: number } | { status: "not_found" }> {
  const account = await prisma.account.findFirst({ where: { id, userId } });
  if (!account) return { status: "not_found" };

  const [txs, outs, ins, adjustments, names] = await Promise.all([
    prisma.transaction.findMany({ where: { userId, accountId: id } }),
    prisma.transfer.findMany({ where: { userId, fromAccountId: id } }),
    prisma.transfer.findMany({ where: { userId, toAccountId: id } }),
    prisma.accountAdjustment.findMany({ where: { userId, accountId: id } }),
    prisma.account.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);
  const name = (accountId: string) => names.find((n) => n.id === accountId)?.name ?? null;
  const opened = startOfAppDay(account.openingDate).getTime();

  type Raw = Omit<AccountEvent, "balanceAfter"> & { at: Date; created: Date };
  const raw: Raw[] = [];
  for (const t of txs) {
    if (t.currency !== account.currency || t.date.getTime() < opened) continue;
    raw.push({
      kind: t.type === "i" ? "income" : "expense",
      at: t.date,
      created: t.createdAt,
      date: dateKeyInTimeZone(t.date, APP_TIME_ZONE),
      amount: t.type === "i" ? t.amount : -t.amount,
      note: t.note,
      counterparty: null,
    });
  }
  for (const t of outs) {
    if (t.date.getTime() < opened) continue;
    raw.push({
      kind: "transfer_out",
      at: t.date,
      created: t.createdAt,
      date: dateKeyInTimeZone(t.date, APP_TIME_ZONE),
      amount: -fromMinor(Number(t.fromAmountMinor)),
      note: t.note,
      counterparty: name(t.toAccountId),
    });
  }
  for (const t of ins) {
    if (t.date.getTime() < opened) continue;
    raw.push({
      kind: "transfer_in",
      at: t.date,
      created: t.createdAt,
      date: dateKeyInTimeZone(t.date, APP_TIME_ZONE),
      amount: fromMinor(Number(t.toAmountMinor)),
      note: t.note,
      counterparty: name(t.fromAccountId),
    });
  }
  for (const a of adjustments) {
    if (a.date.getTime() < opened) continue;
    raw.push({
      kind: "adjustment",
      at: a.date,
      created: a.createdAt,
      date: dateKeyInTimeZone(a.date, APP_TIME_ZONE),
      amount: fromMinor(Number(a.amountMinor)),
      note: a.note,
      counterparty: null,
    });
  }

  // Oldest first to carry the balance forward, then newest first for display.
  // Money in cents so the running balance has no floating-point drift.
  raw.sort((a, b) => a.at.getTime() - b.at.getTime() || a.created.getTime() - b.created.getTime());
  let balanceMinor = Number(account.openingBalanceMinor);
  const events: AccountEvent[] = raw.map(({ at: _at, created: _created, ...e }) => {
    balanceMinor += toMinor(e.amount);
    return { ...e, balanceAfter: fromMinor(balanceMinor) };
  });
  return { status: "ok", events: events.reverse().slice(0, limit), total: events.length };
}
