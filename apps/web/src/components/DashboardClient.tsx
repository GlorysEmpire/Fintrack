"use client";

/**
 * Overview markup ported from legacy app.js renderOverview() + renderBucketBalances().
 * Class names: m-grid, metric, m-lbl, m-val, m-sub, two-col, card, card-t,
 * chart-wrap, legend, wf-row, wf-dot, wf-name, wf-rule, wf-right, wf-amt, wf-pct,
 * sec, bucket-card, fab — same as FinTrack.html
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  activeBuckets,
  safeToSpend,
  type BudgetPlan,
  type CurrencyCode,
  type DashboardLayout,
  type DashboardSectionId,
  type MonthBucketState,
  type WaterfallResult,
  visibleSections,
} from "@fintrack/domain";
import type { AccountOption } from "./LogTransactionModal";
import { DashboardCustomize } from "./DashboardCustomize";
import { AppShell } from "./AppShell";
import { MetricCard } from "./overview/MetricCard";
import { CashflowChartCard } from "./overview/CashflowChartCard";
import { BucketRings } from "./overview/BucketRings";
import { HeroBalanceCard } from "./overview/HeroBalanceCard";
import { BucketDetail } from "./overview/BucketDetail";
import { ForecastCard } from "./overview/ForecastCard";
import {
  HistoryTransactions,
  RecentTransactions,
  type TxListProps,
} from "./overview/RecentTransactions";
import { CountUp } from "./motion/CountUp";
import { monthlySeries, percentChange } from "@/lib/monthly-series";
import { Stagger } from "./motion/Stagger";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Scale } from "lucide-react";
import { SetPasswordPrompt } from "./SetPasswordPrompt";
import type { TxRow } from "@/lib/tx-row";

type Tx = TxRow;

type Source = {
  id: string;
  name: string;
  emoji: string;
  currency: string;
};

type Props = {
  email: string;
  baseCurrency: string;
  onboarding: string;
  /** false for OTP-only accounts — soft prompt to set a password */
  hasPassword: boolean;
  plan: BudgetPlan | null;
  fx: Record<string, number>;
  sources: Source[];
  accounts?: AccountOption[];
  snapshot: {
    income: number;
    expenses: number;
    net: number;
    waterfall: WaterfallResult | null;
    buckets: MonthBucketState[];
  };
  /** All-time totals across the user's full transaction history (base currency) */
  totals: {
    income: number;
    expenses: number;
    net: number;
  };
  /** All-time per-bucket numbers replayed through the month-packing chain */
  allTimeBuckets: MonthBucketState[];
  sampleWaterfall: WaterfallResult | null;
  transactions: Tx[];
  historyTransactions?: Tx[];
  inboxUnread: number;
  daysLeft: number;
  /** Server clock at render time (keeps transaction lock states stable on first paint) */
  serverNow: string;
  layout: DashboardLayout;
  /** Optional next-month projection (Phase 4) */
  forecastNext?: {
    gross: number;
    lines: { bucketId: string; name: string; emoji: string; allocated: number }[];
  } | null;
};

export function DashboardClient(props: Props) {
  const {
    email,
    baseCurrency,
    onboarding,
    hasPassword,
    plan,
    fx,
    sources,
    accounts = [],
    snapshot,
    totals,
    allTimeBuckets,
    sampleWaterfall,
    transactions,
    historyTransactions = [],
    inboxUnread,
    daysLeft,
    serverNow,
    layout,
    forecastNext = null,
  } = props;
  void onboarding;
  /** Summary scope — TOTAL (all history) is the default so returning users
   *  never see their data look wiped on a new month. THIS MONTH shows only the
   *  current calendar month (the previous default behavior). */
  const [scope, setScope] = useState<"total" | "month">("total");
  const base = baseCurrency as CurrencyCode;

  const view = scope === "total" ? totals : snapshot;
  /** Bucket rows follow the same scope: all-time replay or current month */
  const bucketStates = scope === "total" ? allTimeBuckets : snapshot.buckets;
  const actual = snapshot.income;
  // Only real waterfall from logged income (no sample 100k demo)
  const chartWaterfall =
    snapshot.waterfall && actual > 0 ? snapshot.waterfall : null;
  void sampleWaterfall;

  const bucketRemaining = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of snapshot.buckets) {
      out[b.bucketId] = b.closing;
    }
    if (plan) {
      for (const p of activeBuckets(plan.buckets)) {
        if (!(p.id in out)) out[p.id] = 0;
      }
    }
    return out;
  }, [snapshot.buckets, plan]);

  /** Waterfall lines with remaining balances for allocation donut */
  const remainingWaterfall: WaterfallResult | null = useMemo(() => {
    if (!chartWaterfall) return null;
    const spentBy: Record<string, number> = {};
    for (const b of snapshot.buckets) {
      spentBy[b.bucketId] = b.spent;
    }
    const lines = chartWaterfall.lines.map((l) => {
      const spent = spentBy[l.bucketId] || 0;
      const remaining = Math.max(0, l.allocated - spent);
      return { ...l, allocated: remaining };
    });
    const allocatedTotal = lines.reduce((s, l) => s + l.allocated, 0);
    return {
      ...chartWaterfall,
      lines,
      allocatedTotal,
      unallocated: Math.max(0, chartWaterfall.gross - allocatedTotal),
    };
  }, [chartWaterfall, snapshot.buckets]);

  const sections = visibleSections(layout);

  /** Shared props for every transaction list on this page */
  const txListProps: TxListProps = {
    plan,
    sources,
    accounts,
    baseCurrency,
    fx,
    bucketRemaining,
    monthIncome: snapshot.income,
    serverNow,
  };

  const isTotal = scope === "total";
  const expenseRowsAll = useMemo(() => [...historyTransactions, ...transactions], [historyTransactions, transactions]);
  // Last month against this month, for the change shown under Income and Expenses
  const [lastMonth, thisMonth] = useMemo(
    () => monthlySeries(expenseRowsAll, base, fx, 2, new Date(serverNow)),
    [expenseRowsAll, base, fx, serverNow]
  );
  // "Safe to spend" is this month's Spend bucket, whatever the TOTAL / THIS MONTH toggle says
  const safe = safeToSpend(snapshot.buckets, daysLeft);
  const expenseRows = scope === "total" ? [...historyTransactions, ...transactions] : transactions;

  const metrics = (
    <div className="m-grid">
      <MetricCard
        icon={Scale}
        label={isTotal ? "Net" : "Net remaining"}
        sub={
          isTotal
            ? view.net >= 0
              ? "cumulative savings"
              : "cumulative deficit"
            : view.net >= 0
              ? "available"
              : "over budget"
        }
        valueClassName={view.net >= 0 ? "text-primary" : "text-destructive"}
      >
        <CountUp value={Math.abs(view.net)} currency={base} />
      </MetricCard>
      <MetricCard
        icon={ArrowUpRight}
        chipClassName="bg-destructive/12 text-destructive"
        label="Total expenses"
        sub={isTotal ? "all time" : "all buckets combined"}
        valueClassName="text-destructive"
        delta={isTotal ? undefined : { pct: percentChange(thisMonth.expenses, lastMonth.expenses), upIsGood: false }}
      >
        <CountUp value={view.expenses} currency={base} />
      </MetricCard>
      <MetricCard
        icon={ArrowDownLeft}
        label="Income logged"
        sub={isTotal ? "all time" : "actual this month"}
        delta={isTotal ? undefined : { pct: percentChange(thisMonth.income, lastMonth.income), upIsGood: true }}
      >
        <CountUp value={view.income} currency={base} />
      </MetricCard>
      <MetricCard icon={CalendarDays} label="Days left" sub="in this month">
        <span className="font-display tabular-nums">{daysLeft}</span>
      </MetricCard>
    </div>
  );

  function renderSection(id: DashboardSectionId) {
    switch (id) {
      case "plan_status":
        if (!(onboarding === "skipped" && !plan)) return null;
        return (
          <div className="card" key={id}>
            <p className="text-xs text-muted-foreground">
              Plan not set —{" "}
              <Link href="/settings">build your plan in Plan settings</Link>.
            </p>
          </div>
        );
      case "metrics":
        return <div key={id}>{metrics}</div>;
      case "charts":
        return (
          <div key={id}>
            <CashflowChartCard
              waterfall={remainingWaterfall}
              rows={expenseRowsAll}
              baseCurrency={baseCurrency}
              fx={fx}
              serverNow={serverNow}
            />
          </div>
        );
      case "bucket_balances":
        return (
          <div key={id}>
            <BucketRings plan={plan} states={bucketStates} base={base} scope={scope} />
          </div>
        );
      case "bucket_detail":
        return (
          <div key={id}>
            <BucketDetail plan={plan} states={bucketStates} base={base} scope={scope} expenses={expenseRows} />
          </div>
        );
      case "recent_transactions":
        return (
          <div key={id}>
            <RecentTransactions rows={transactions} listProps={txListProps} />
            <HistoryTransactions rows={historyTransactions} listProps={txListProps} />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <AppShell
      baseCurrency={baseCurrency}
      email={email}
      inboxUnread={inboxUnread}
    >
      <div className="dash-toolbar">
        <DashboardCustomize layout={layout} />
      </div>

      <h1 className="sr-only">Overview</h1>
      <Stagger>
        <div>
          <HeroBalanceCard
            base={base}
            safe={safe}
            monthNet={snapshot.net}
            netTotal={totals.net}
            daysLeft={daysLeft}
            hasIncome={snapshot.income > 0 || safe.total > 0}
          />
        </div>
        <div>
          <SetPasswordPrompt hasPassword={hasPassword} />
        </div>
        <div>
        <div className="mb-3 flex items-center gap-1.5">
          <button
            type="button"
            className={`nav-btn${scope === "total" ? " on" : ""}`}
            aria-pressed={scope === "total"}
            onClick={() => setScope("total")}
          >
            TOTAL
          </button>
          <button
            type="button"
            className={`nav-btn${scope === "month" ? " on" : ""}`}
            aria-pressed={scope === "month"}
            onClick={() => setScope("month")}
          >
            THIS MONTH
          </button>
        </div>
        </div>
        {sections.map((id) => renderSection(id))}
        <div>
          <ForecastCard forecast={forecastNext} base={base} />
        </div>
      </Stagger>
    </AppShell>
  );
}
