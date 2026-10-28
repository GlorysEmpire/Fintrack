/**
 * DETERMINISTIC INSIGHTS — what stands out in the user's own numbers.
 *
 * Every insight is a fixed rule over figures FinTrack already computed. It says
 * what was observed, shows the numbers it rests on (`evidence`), and at most
 * suggests one concrete step within the app. No AI is involved in deciding any
 * of it. The Steward may put these into words; it may not change them or add
 * arithmetic of its own.
 *
 * What these never do: recommend an investment, predict returns, or claim the
 * user's wealth went up or down. They describe cash flow, plan adherence,
 * balances the user recorded, and gaps in the records.
 *
 * Pure rules only: no database, no React.
 */
import { CURRENCY_SYMBOLS, formatMoney, type CurrencyCode } from "./fx";
import type { ExpenseRateTrend, MonthComparison, MonthPerformance } from "./performance";

export type InsightSeverity = "attention" | "info" | "good";

export interface Insight {
  /** Stable id, so a screen or test can refer to a rule */
  id: string;
  severity: InsightSeverity;
  title: string;
  /** One or two plain sentences */
  detail: string;
  /** The numbers the insight rests on, one per line */
  evidence: string[];
  /** At most one concrete step inside the app */
  next?: string;
}

export interface InsightInput {
  baseCurrency: string;
  /** Oldest first, as monthlyPerformance returns them */
  months: MonthPerformance[];
  comparison: MonthComparison;
  trend: ExpenseRateTrend;
  /** This month's buckets */
  buckets: { name: string; available: number; spent: number; closing: number }[];
  accounts: { name: string; kind: "asset" | "liability"; currency: string; balance: number; owed: number; belowZero: boolean }[];
  /** Transactions not assigned to any account */
  unassignedCount: number;
  /** Bank imports waiting for a decision, and ones the bank changed after the user recorded them */
  pendingImports: number;
  changedImports: number;
  /** Recurring rules whose last run had a problem or skipped something */
  rulesWithProblems: number;
  /** Cross-bucket spends this month */
  crossBucketThisMonth: number;
  /** Expenses this month funded from another bucket by an approved exception, and the total moved (base currency) */
  exceptionsThisMonth?: { count: number; totalMoved: number };
}

/** Spending this far above the same days last month is worth a mention */
const PACE_RISE_PERCENT = 20;
/** A bucket this much spent is nearly empty */
const BUCKET_NEARLY_EMPTY_PERCENT = 90;
const CROSS_BUCKET_NOTICE = 3;

function exact(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency as CurrencyCode] ?? "";
  return `${sym}${Math.abs(amount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ORDER: Record<InsightSeverity, number> = { attention: 0, info: 1, good: 2 };

export function deriveInsights(input: InsightInput): Insight[] {
  const base = input.baseCurrency as CurrencyCode;
  const money = (n: number) => formatMoney(n, base);
  const out: Insight[] = [];

  const finished = input.months.filter((m) => !m.inProgress);
  const lastFinished = finished[finished.length - 1];

  // 1. Where the expense rate is heading (a direction, never a verdict)
  if (input.trend.status !== "insufficient_data") {
    out.push({
      id: "expense-rate-trend",
      severity: input.trend.status === "higher" ? "attention" : input.trend.status === "lower" ? "good" : "info",
      title:
        input.trend.status === "higher"
          ? "You are spending a bigger share of your income"
          : input.trend.status === "lower"
            ? "You are spending a smaller share of your income"
            : "Your spending share is steady",
      detail: input.trend.explanation,
      evidence: [
        `Recent average expense rate: ${Math.round(input.trend.recentAverage ?? 0)}%`,
        `Earlier average: ${Math.round(input.trend.earlierAverage ?? 0)}%`,
        `Finished months compared: ${input.trend.monthsUsed}`,
      ],
    });
  }

  // 2. Pace this month against the same days last month
  const c = input.comparison;
  if (c.previousSamePeriod.expenses > 0 && c.current.expenses > 0) {
    const rise = ((c.current.expenses - c.previousSamePeriod.expenses) / c.previousSamePeriod.expenses) * 100;
    if (rise >= PACE_RISE_PERCENT) {
      out.push({
        id: "spending-pace",
        severity: "attention",
        title: "You are spending faster than last month",
        detail: `By day ${c.throughDay} you have spent ${Math.round(rise)}% more than by the same day last month.`,
        evidence: [
          `This month so far: ${money(c.current.expenses)}`,
          `${c.previousMonth}, same days: ${money(c.previousSamePeriod.expenses)}`,
        ],
        next: "Open Expenses and look at the largest ones this month.",
      });
    }
  }

  // 3. Buckets nearly empty
  for (const b of input.buckets) {
    if (b.available > 0 && (b.spent / b.available) * 100 >= BUCKET_NEARLY_EMPTY_PERCENT && b.closing >= 0) {
      out.push({
        id: `bucket-nearly-empty:${b.name}`,
        severity: "info",
        title: `${b.name} is nearly used up`,
        detail: `${Math.round((b.spent / b.available) * 100)}% of ${b.name} is spent for this month. Spending past zero is blocked.`,
        evidence: [`Available: ${money(b.available)}`, `Spent: ${money(b.spent)}`, `Left: ${money(Math.max(0, b.closing))}`],
      });
    }
  }

  // 4. Accounts
  for (const a of input.accounts.filter((x) => x.belowZero)) {
    out.push({
      id: `account-below-zero:${a.name}`,
      severity: "attention",
      title: `${a.name} is below zero`,
      detail: "A balance below zero usually means a record is missing (income, a transfer, or an opening balance).",
      evidence: [`Recorded balance: −${exact(a.balance, a.currency)}`],
      next: "Check that account's History, or record an adjustment if the real balance differs.",
    });
  }
  const debts = input.accounts.filter((a) => a.kind === "liability" && a.owed > 0);
  for (const d of debts) {
    out.push({
      id: `debt:${d.name}`,
      severity: "info",
      title: `You owe on ${d.name}`,
      detail: "This is the balance you recorded for that debt.",
      evidence: [`Owed: ${exact(d.owed, d.currency)}`],
    });
  }
  if (input.unassignedCount > 0 && input.accounts.length > 0) {
    out.push({
      id: "unassigned-transactions",
      severity: "info",
      title: "Some transactions are not tied to an account",
      detail: "They count in your income and spending but not in any account balance.",
      evidence: [`Unassigned transactions: ${input.unassignedCount}`],
      next: "On Accounts, assign them to the account they belong to.",
    });
  }

  // 5. Money set aside
  const lastTwo = finished.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((m) => m.income > 0 && m.movedToSavings === 0) && input.accounts.some((a) => a.kind === "asset")) {
    out.push({
      id: "nothing-moved-to-savings",
      severity: "info",
      title: "No money moved into savings recently",
      detail: "Nothing was transferred into a savings or investment account in the last two finished months. This only counts transfers you recorded.",
      evidence: lastTwo.map((m) => `${m.month}: moved to savings ${money(m.movedToSavings)}, income ${money(m.income)}`),
    });
  } else if (lastFinished && lastFinished.movedToSavings > 0) {
    out.push({
      id: "moved-to-savings",
      severity: "good",
      title: "You set money aside last month",
      detail: "Transfers into your savings and investment accounts are recorded. Setting money aside is not spending, and it does not by itself show that the account grew.",
      evidence: [`${lastFinished.month}: moved to savings ${money(lastFinished.movedToSavings)}`],
    });
  }

  // 6. Months that spent more than they earned
  if (lastFinished && lastFinished.hasRecords && lastFinished.income > 0 && lastFinished.surplus < 0) {
    out.push({
      id: "deficit-month",
      severity: "attention",
      title: "Last month you spent more than you recorded earning",
      detail: "Either income was missed in the records, or spending ran ahead of income.",
      evidence: [`${lastFinished.month}: income ${money(lastFinished.income)}, expenses ${money(lastFinished.expenses)}`],
      next: "Check that all of that month's income was logged.",
    });
  }

  // 7. Following the plan
  if (input.crossBucketThisMonth >= CROSS_BUCKET_NOTICE) {
    out.push({
      id: "cross-bucket-pattern",
      severity: "attention",
      title: "Several spends this month went outside their bucket's category",
      detail: "One is a choice; a run of them suggests the plan no longer matches how you really spend.",
      evidence: [`Cross-bucket spends this month: ${input.crossBucketThisMonth}`],
      next: "If it keeps happening, adjust the plan so it matches reality.",
    });
  }
  if (lastFinished && lastFinished.planAdherence !== null && lastFinished.bucketsBelowZero > 0) {
    out.push({
      id: "buckets-below-zero",
      severity: "attention",
      title: "Some buckets ended last month below zero",
      detail: "That happens when history is recalculated, for example after a plan change or a corrected income.",
      evidence: [`${lastFinished.month}: ${lastFinished.bucketsBelowZero} bucket(s) below zero`],
    });
  }

  // 7b. Approved exceptions: where extra money came from, so it is never quiet
  if (input.exceptionsThisMonth && input.exceptionsThisMonth.count > 0) {
    const n = input.exceptionsThisMonth.count;
    out.push({
      id: "exceptions-this-month",
      severity: n >= 2 ? "attention" : "info",
      title: n === 1 ? "An expense this month was funded from another bucket" : `${n} expenses this month were funded from other buckets`,
      detail: "Each was your approved decision, and each is recorded with your reason. They change what your plan really did.",
      evidence: [`Approved exceptions: ${n}`, `Moved between buckets: ${money(input.exceptionsThisMonth.totalMoved)}`],
      next: "Open Trends and look at Plan deviations.",
    });
  }

  // 8. Things waiting on the user
  if (input.pendingImports > 0) {
    out.push({
      id: "imports-to-review",
      severity: "info",
      title: "Bank transactions are waiting for your review",
      detail: "Nothing from the bank counts until you accept or match it.",
      evidence: [`To review: ${input.pendingImports}`],
      next: "Open Bank imports.",
    });
  }
  if (input.changedImports > 0) {
    out.push({
      id: "imports-changed",
      severity: "attention",
      title: "The bank changed something you already recorded",
      detail: "Your recorded transactions were not changed. Look at what the bank now says.",
      evidence: [`Changed: ${input.changedImports}`],
      next: "Open Bank imports.",
    });
  }
  if (input.rulesWithProblems > 0) {
    out.push({
      id: "recurring-problems",
      severity: "attention",
      title: "A recurring rule did not run cleanly",
      detail: "An occurrence may have been skipped, for example when its bucket could not cover it.",
      evidence: [`Rules with a problem: ${input.rulesWithProblems}`],
      next: "Open Plan and look at the Recurring section.",
    });
  }

  // 9. Gaps in the records, so no one over-reads the numbers
  const gaps = input.months.filter((m) => !m.inProgress && !m.hasRecords);
  if (gaps.length > 0) {
    out.push({
      id: "months-without-records",
      severity: "info",
      title: "Some months have no records",
      detail: "Trends skip them, so the picture may be incomplete.",
      evidence: [`Months with nothing recorded: ${gaps.map((m) => m.month).join(", ")}`],
    });
  }

  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/** The insights as plain lines, for a prompt or a text reply */
export function insightLines(insights: Insight[], max = 8): string[] {
  return insights.slice(0, max).map((i) => `- [${i.severity}] ${i.title}. ${i.detail} (${i.evidence.join("; ")})`);
}
