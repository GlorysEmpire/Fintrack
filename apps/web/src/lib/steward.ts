/**
 * What the Steward is allowed to know, assembled from the same deterministic
 * services the screens use: this month, the buckets, the accounts, the last
 * months and their trend, and the insights derived from them.
 *
 * The Steward explains these facts. It is told not to do arithmetic of its own
 * or to invent anything not in this text, and every figure here comes from code,
 * never from a model. All reads are scoped to the user's id.
 */
import {
  PERFORMANCE_LIMITS,
  deriveInsights,
  filterMonthTxs,
  formatMoney,
  insightLines,
  monthSnapshot,
  startOfMonth,
  type CurrencyCode,
  type Insight,
  type MoneyTx,
} from "@fintrack/domain";
import { listAccounts } from "./accounts";
import { listImports } from "./bank/review";
import { prisma } from "./db";
import { reallocationTxs } from "./reallocations";
import { ensureMonthPacked } from "./month-close";
import { parseFx, parseOpeningBalances } from "./money";
import { getPerformance, type PerformanceView } from "./performance";
import { getUserPlan } from "./plan";

export type StewardView = {
  /** The full text given to the Steward */
  context: string;
  insights: Insight[];
  /** The month-by-month figures the insights rest on */
  performance: PerformanceView;
  /** For the guided (offline) reply */
  offline: {
    income: number;
    expenses: number;
    net: number;
    planName: string | null;
    bucketLines: string[];
    overrideCount: number;
    insightLines: string[];
  };
};

export async function getStewardView(
  user: { id: string; email: string; baseCurrency: string; fxRates: string },
  now: Date = new Date()
): Promise<StewardView> {
  // Make sure this month's carry-over is current before reading it
  await ensureMonthPacked(user.id, now);

  const base = user.baseCurrency as CurrencyCode;
  const fx = parseFx(user.fxRates);
  const money = (n: number) => formatMoney(n, base);

  const [plan, planRow, sources, monthRows, overrideCount, performance, accountList, imports, rules] =
    await Promise.all([
      getUserPlan(user.id),
      prisma.budgetPlan.findUnique({ where: { userId: user.id } }),
      prisma.incomeSource.findMany({ where: { userId: user.id } }),
      prisma.transaction.findMany({
        where: { userId: user.id, date: { gte: startOfMonth(now) } },
        orderBy: { date: "desc" },
      }),
      prisma.transaction.count({ where: { userId: user.id, override: true } }),
      getPerformance(user, now),
      listAccounts(user.id),
      listImports(user.id),
      prisma.recurringRule.findMany({ where: { userId: user.id, active: true } }),
    ]);

  const moneyTxs: MoneyTx[] = [...monthRows.map((t) => ({
    type: t.type as "i" | "e",
    amount: t.amount,
    currency: t.currency,
    bucketId: t.bucketId,
    sourceId: t.sourceId,
    date: t.date,
  })), ...(await reallocationTxs(user.id, { since: startOfMonth(now) }))];
  const moves = moneyTxs.filter((t) => t.type === "m");
  const opening = planRow ? parseOpeningBalances(planRow.openingBalancesJson) : {};
  const snap = monthSnapshot(plan, filterMonthTxs(moneyTxs, now), user.baseCurrency, fx, opening);
  const nameOf = (id: string) => plan?.buckets.find((b) => b.id === id)?.name || id;

  const bucketLines = snap.buckets.map(
    (b) =>
      `${nameOf(b.bucketId)}: left ${money(b.closing)} (spent ${money(b.spent)})`
  );
  const longBucketLines = snap.buckets.map(
    (b) =>
      `- ${nameOf(b.bucketId)}: available ${money(b.opening + b.allocated + b.moved)}, spent ${money(b.spent)}, left ${money(b.closing)}${b.carryOver ? " (carry-over)" : ""}`
  );

  const insights = deriveInsights({
    baseCurrency: user.baseCurrency,
    months: performance.months,
    comparison: performance.comparison,
    trend: performance.trend,
    buckets: snap.buckets.map((b) => ({
      name: nameOf(b.bucketId),
      available: b.opening + b.allocated + b.moved,
      spent: b.spent,
      closing: b.closing,
    })),
    accounts: accountList.accounts
      .filter((a) => a.status === "active")
      .map((a) => ({
        name: a.name,
        kind: a.kind,
        currency: a.currency,
        balance: a.balance,
        owed: a.owed,
        belowZero: a.belowZero,
      })),
    unassignedCount: accountList.unassignedCount,
    pendingImports: imports.filter((i) => i.review === "new").length,
    changedImports: imports.filter((i) => i.attention).length,
    rulesWithProblems: rules.filter((r) => r.lastError).length,
    crossBucketThisMonth: monthRows.filter((t) => t.type === "e" && t.override).length,
    exceptionsThisMonth: {
      count: moves.length,
      totalMoved: moves.reduce((sum, m) => sum + m.amount, 0),
    },
  });

  const exact = (n: number, ccy: string) =>
    `${n < 0 ? "-" : ""}${formatMoney(Math.abs(n), ccy as CurrencyCode)}${Math.abs(n) % 1 ? "" : ""}`;
  const accountLines = accountList.accounts
    .filter((a) => a.status === "active")
    .map((a) =>
      a.kind === "liability"
        ? `- ${a.name} (${a.typeLabel}, debt): owed ${exact(a.owed, a.currency)} ${a.currency}`
        : `- ${a.name} (${a.typeLabel}): ${exact(a.balance, a.currency)} ${a.currency}`
    );

  const monthLines = performance.months.slice(-6).map((m) => {
    if (!m.hasRecords) return `- ${m.month}: no records`;
    const rate =
      m.expenseRate === null
        ? "expense rate not available (no income recorded)"
        : `expense rate ${Math.round(m.expenseRate)}%${m.inProgress ? " so far" : ""}`;
    return `- ${m.month}${m.inProgress ? ` (in progress, day ${m.daysElapsed} of ${m.daysInMonth})` : ""}: income ${money(m.income)}, expenses ${money(m.expenses)}, ${rate}, surplus ${m.surplus < 0 ? "-" : ""}${money(Math.abs(m.surplus))}`;
  });

  const context = [
    `Today: ${now.toISOString().slice(0, 10)}`,
    `Base currency: ${user.baseCurrency}`,
    `Plan: ${plan?.name || "none"}`,
    "",
    "This month so far:",
    `- Income: ${money(snap.income)}`,
    `- Expenses: ${money(snap.expenses)}`,
    `- Net: ${snap.net < 0 ? "-" : ""}${money(Math.abs(snap.net))}`,
    `- Cross-bucket spends this month: ${monthRows.filter((t) => t.type === "e" && t.override).length}`,
    `- ${performance.comparison.note}`,
    "",
    "Buckets (this month):",
    ...(longBucketLines.length ? longBucketLines : ["(no plan yet)"]),
    "",
    "Accounts (balances the user recorded; these are not net worth):",
    ...(accountLines.length ? accountLines : ["(no accounts yet)"]),
    accountList.unassignedCount > 0 ? `- ${accountList.unassignedCount} transactions are not assigned to any account` : "",
    "",
    "Recent months:",
    ...(monthLines.length ? monthLines : ["(nothing recorded yet)"]),
    `Expense-rate trend: ${performance.trend.explanation || "not enough history"}`,
    "",
    "Facts worked out by FinTrack (explain these; do not change them):",
    ...(insights.length ? insightLines(insights, 10) : ["- nothing stands out right now"]),
    "",
    "Limits of these numbers:",
    ...PERFORMANCE_LIMITS.map((l) => `- ${l}`),
    "",
    "Income sources:",
    sources.map((s) => `${s.emoji} ${s.name} (${s.currency})`).join("; ") || "(none)",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");

  return {
    context,
    insights,
    performance,
    offline: {
      income: snap.income,
      expenses: snap.expenses,
      net: snap.net,
      planName: plan?.name || null,
      bucketLines,
      overrideCount,
      insightLines: insightLines(insights, 5),
    },
  };
}
