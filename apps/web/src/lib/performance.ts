/**
 * Loads one user's records and runs the deterministic performance maths over
 * them (packages/domain/src/performance.ts). Nothing here changes any data.
 * Every read is scoped to the user's id.
 */
import {
  PERFORMANCE_LIMITS,
  accountMovementForMonth,
  compareWithPreviousMonth,
  expenseRateTrend,
  fromMinor,
  monthKeyOf,
  monthlyPerformance,
  savingsFlowsByMonth,
  startOfMonthOffset,
  type AccountKind,
  type ExpenseRateTrend,
  type MonthComparison,
  type MonthPerformance,
  type PerfTx,
} from "@fintrack/domain";
import { prisma } from "./db";
import { parseFx } from "./money";
import { getUserPlan } from "./plan";

export type AccountMovementView = {
  month: string;
  accounts: {
    accountId: string;
    name: string;
    kind: AccountKind;
    currency: string;
    /** Major units, signed money held (a debt is negative) */
    start: number;
    end: number;
    net: number;
    openedThisMonth: boolean;
    income: number;
    expenses: number;
    transfersIn: number;
    transfersOut: number;
    fees: number;
    adjustments: number;
  }[];
};

export type PerformanceView = {
  baseCurrency: string;
  months: MonthPerformance[];
  comparison: MonthComparison;
  trend: ExpenseRateTrend;
  /** The finished previous month first, then the month so far */
  accountMovement: AccountMovementView[];
  /** Transactions not assigned to any account (so absent from account movement) */
  unassignedCount: number;
  limits: readonly string[];
};

export async function getPerformance(
  user: { id: string; baseCurrency: string; fxRates: string },
  now: Date = new Date()
): Promise<PerformanceView> {
  const fx = parseFx(user.fxRates);
  const base = user.baseCurrency;

  const [rows, plan, accounts, transfers, adjustments, unassignedCount] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id },
      select: {
        type: true,
        amount: true,
        currency: true,
        bucketId: true,
        sourceId: true,
        date: true,
        override: true,
        accountId: true,
      },
    }),
    getUserPlan(user.id),
    prisma.account.findMany({ where: { userId: user.id } }),
    prisma.transfer.findMany({ where: { userId: user.id } }),
    prisma.accountAdjustment.findMany({ where: { userId: user.id } }),
    prisma.transaction.count({ where: { userId: user.id, accountId: null } }),
  ]);

  const txs: PerfTx[] = rows.map((t) => ({
    type: t.type as "i" | "e",
    amount: t.amount,
    currency: t.currency,
    bucketId: t.bucketId,
    sourceId: t.sourceId,
    date: t.date,
    override: t.override,
  }));

  const ledgerTransfers = transfers.map((t) => ({
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    fromAmountMinor: Number(t.fromAmountMinor),
    toAmountMinor: Number(t.toAmountMinor),
    feeMinor: Number(t.feeMinor),
    date: t.date,
  }));
  const savingsFlows = savingsFlowsByMonth({
    accounts: accounts.map((a) => ({ id: a.id, type: a.type, currency: a.currency })),
    transfers: ledgerTransfers,
    base,
    fx,
  });

  const months = monthlyPerformance({ txs, plan, base, fx, now, savingsFlows });
  const comparison = compareWithPreviousMonth({ txs, base, fx, now });
  const trend = expenseRateTrend(months);

  const ledgerAccounts = accounts.map((a) => ({
    id: a.id,
    kind: a.kind as AccountKind,
    currency: a.currency,
    openingBalanceMinor: Number(a.openingBalanceMinor),
    openingDate: a.openingDate,
  }));
  const ledgerTxs = rows
    .filter((t) => t.accountId)
    .map((t) => ({
      accountId: t.accountId,
      type: t.type as "i" | "e",
      amount: t.amount,
      currency: t.currency,
      date: t.date,
    }));
  const ledgerAdjustments = adjustments.map((a) => ({
    accountId: a.accountId,
    amountMinor: Number(a.amountMinor),
    date: a.date,
  }));

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const movementFor = (month: string): AccountMovementView => ({
    month,
    accounts: accountMovementForMonth({
      accounts: ledgerAccounts,
      txs: ledgerTxs,
      transfers: ledgerTransfers,
      adjustments: ledgerAdjustments,
      month,
    }).map((m) => {
      const a = byId.get(m.accountId)!;
      return {
        accountId: m.accountId,
        name: a.name,
        kind: a.kind as AccountKind,
        currency: a.currency,
        start: fromMinor(m.startMinor),
        end: fromMinor(m.endMinor),
        net: fromMinor(m.netMinor),
        openedThisMonth: m.openedThisMonth,
        income: fromMinor(m.incomeMinor),
        expenses: fromMinor(m.expenseMinor),
        transfersIn: fromMinor(m.transfersInMinor),
        transfersOut: fromMinor(m.transfersOutMinor),
        fees: fromMinor(m.feesMinor),
        adjustments: fromMinor(m.adjustmentsMinor),
      };
    }),
  });

  return {
    baseCurrency: base,
    months,
    comparison,
    trend,
    accountMovement: accounts.length
      ? [monthKeyOf(startOfMonthOffset(-1, now)), monthKeyOf(now)].map(movementFor)
      : [],
    unassignedCount,
    limits: PERFORMANCE_LIMITS,
  };
}
