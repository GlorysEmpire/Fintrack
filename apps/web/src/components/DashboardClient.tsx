"use client";

/**
 * Overview markup ported from legacy app.js renderOverview() + renderBucketBalances().
 * Class names: m-grid, metric, m-lbl, m-val, m-sub, two-col, card, card-t,
 * chart-wrap, legend, wf-row, wf-dot, wf-name, wf-rule, wf-right, wf-amt, wf-pct,
 * sec, bucket-card, fab — same as FinTrack.html
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Receipt } from "lucide-react";
import {
  activeBuckets,
  bucketRuleLabel,
  formatMoney,
  sortBucketsByPlanOrder,
  transactionLockState,
  type BudgetPlan,
  type CurrencyCode,
  type DashboardLayout,
  type DashboardSectionId,
  type MonthBucketState,
  type WaterfallResult,
  visibleSections,
} from "@fintrack/domain";
import { LogTransactionModal } from "./LogTransactionModal";
import { TransactionList } from "./TransactionList";
import { DashboardCharts } from "./DashboardCharts";
import { DashboardCustomize } from "./DashboardCustomize";
import { AppShell } from "./AppShell";
import { EmptyState } from "./EmptyState";
import { Money } from "./Money";
import { SetPasswordPrompt } from "./SetPasswordPrompt";
import { bucketColor } from "@/lib/bucket-colors";
import type { TxRow } from "@/lib/tx-row";
import { useCountUp } from "@/hooks/useCountUp";

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
  const [modalOpen, setModalOpen] = useState(false);
  /** Summary scope — TOTAL (all history) is the default so returning users
   *  never see their data look wiped on a new month. THIS MONTH shows only the
   *  current calendar month (the previous default behavior). */
  const [scope, setScope] = useState<"total" | "month">("total");
  const base = baseCurrency as CurrencyCode;

  const view = scope === "total" ? totals : snapshot;
  /** Bucket rows follow the same scope: all-time replay or current month */
  const bucketStates = scope === "total" ? allTimeBuckets : snapshot.buckets;
  const actual = snapshot.income;
  const incomeAnim = useCountUp(view.income);
  const expenseAnim = useCountUp(view.expenses);
  const netAnim = useCountUp(Math.abs(view.net));
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

  /**
   * Rows for a short list: every transaction that can still be edited is always
   * shown (so it can be found and corrected while its window is open), then the
   * most recent locked ones up to `limit`. Order is unchanged (newest first).
   */
  function rowsToShow(all: Tx[], limit: number): Tx[] {
    const at = new Date(serverNow);
    const editable = all.filter(
      (t) => !transactionLockState(t.createdAt, at).locked
    );
    const keep = new Set(editable.map((t) => t.id));
    for (const t of all) {
      if (keep.size >= Math.max(limit, editable.length)) break;
      keep.add(t.id);
    }
    return all.filter((t) => keep.has(t.id));
  }

  /** Shared props for every transaction list on this page */
  const txListProps = {
    plan,
    sources,
    baseCurrency,
    fx,
    bucketRemaining,
    monthIncome: snapshot.income,
    serverNow,
  };

  /** Overview metrics with odometer count-up */
  function Metrics() {
    const isTotal = scope === "total";
    return (
      <div className="m-grid">
          <div className="metric">
            <div className="m-lbl">
              {isTotal ? "Net" : "Net remaining"}
            </div>
            <div
              className="m-val"
              style={{ color: view.net >= 0 ? "var(--g)" : "var(--r)" }}
            >
              <Money amount={netAnim} currency={base} />
            </div>
            <div className="m-sub">
              {isTotal
                ? view.net >= 0
                  ? "cumulative savings"
                  : "cumulative deficit"
                : view.net >= 0
                  ? "available"
                  : "over budget"}
            </div>
          </div>
          <div className="metric">
            <div className="m-lbl">Total expenses</div>
            <div className="m-val" style={{ color: "var(--r)" }}>
              <Money amount={expenseAnim} currency={base} />
            </div>
            <div className="m-sub">
              {isTotal ? "all time" : "all buckets combined"}
            </div>
          </div>
          <div className="metric">
            <div className="m-lbl">Income logged</div>
            <div className="m-val">
              <Money amount={incomeAnim} currency={base} />
            </div>
            <div className="m-sub">
              {isTotal ? "all time" : "actual this month"}
            </div>
          </div>
          <div className="metric">
            <div className="m-lbl">Days left</div>
            <div className="m-val font-mono tabular-nums">{daysLeft}</div>
            <div className="m-sub">in this month</div>
          </div>
        </div>
    );
  }

  function ForecastCard() {
    if (!forecastNext || forecastNext.gross <= 0) return null;
    return (
      <div className="card glass-card">
        <div className="card-t">Next month projection</div>
        <p className="m-sub" style={{ marginBottom: 10 }}>
          Based on this month&apos;s income pattern + recurring rules
        </p>
        <div className="m-val" style={{ marginBottom: 12 }}>
          <Money amount={forecastNext.gross} currency={base} />
        </div>
        <div className="legend">
          {forecastNext.lines.slice(0, 6).map((l, i) => (
            <div className="legend-item" key={l.bucketId}>
              <div
                className="legend-dot"
                style={{ background: bucketColor(l.bucketId, i) }}
              />
              {l.emoji} {l.name}:{" "}
              <Money amount={l.allocated} currency={base} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /** Charts show remaining balances (not total allocated) */
  function Charts() {
    if (!remainingWaterfall || remainingWaterfall.gross <= 0) {
      return (
        <div className="two-col">
          <div className="card">
            <div className="card-t">📊 Income allocation (remaining)</div>
            <p style={{ fontSize: 12, color: "var(--tx3)" }}>
              Log income to fund buckets. Remaining starts at 0.
            </p>
          </div>
          <div className="card">
            <div className="card-t">📈 Monthly cash flow</div>
            <p style={{ fontSize: 12, color: "var(--tx3)" }}>
              Log income to populate charts.
            </p>
          </div>
        </div>
      );
    }
    return (
      <DashboardCharts
        waterfall={remainingWaterfall}
        baseCurrency={baseCurrency}
        remainingMode
      />
    );
  }

  /**
   * Legacy wfRows — exact structure:
   * wf-row > wf-dot | name+rule | flex row with bar + amounts
   */
  function BucketBalances() {
    if (!plan) {
      return (
        <div className="card">
          <div className="card-t">
            💧 Bucket balances{" "}
            <span style={{ fontSize: 10, fontWeight: 400, color: "var(--tx3)" }}>
              {scope === "total"
                ? "— all-time allocated vs spent"
                : "— allocated vs remaining after expenses"}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--tx3)" }}>
            <Link href="/settings">Set a plan</Link> to track buckets.
          </p>
        </div>
      );
    }

    const orderedPlan = sortBucketsByPlanOrder(activeBuckets(plan.buckets));
    const byId = new Map(bucketStates.map((b) => [b.bucketId, b]));
    const rows: {
      id: string;
      emoji: string;
      name: string;
      rule: string;
      alloc: number;
      spent: number;
      left: number;
      over: boolean;
      p: number;
      col: string;
      wfc: string;
    }[] = orderedPlan.map((meta, i) => {
      const b = byId.get(meta.id);
      const alloc = b ? b.opening + b.allocated : 0;
      const spent = b?.spent || 0;
      const left = alloc - spent;
      const over = left < 0;
      const p = alloc > 0 ? Math.min(100, (spent / alloc) * 100) : 0;
      const wfc = bucketColor(meta.id, i);
      const col = over ? "var(--r)" : p > 85 ? "var(--y)" : wfc;
      return {
        id: meta.id,
        emoji: meta.emoji || "",
        name: meta.name || meta.id,
        rule: `${bucketRuleLabel(meta, base)}${
          meta.carryOver ? " · carries over" : " · resets monthly"
        }`,
        alloc,
        spent,
        left,
        over,
        p,
        col,
        wfc,
      };
    });

    return (
      <div className="card">
        <div className="card-t">
          💧 Bucket balances{" "}
          <span style={{ fontSize: 10, fontWeight: 400, color: "var(--tx3)" }}>
            {scope === "total"
              ? "— all-time allocated vs spent"
              : "— allocated vs remaining after expenses"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0 }}>
          {rows.map((r) => (
            <div className="wf-row" key={r.id}>
              <div className="wf-dot" style={{ background: r.wfc }} />
              <div style={{ flex: 1 }}>
                <div className="wf-name">
                  {r.emoji} {r.name}
                </div>
                <div className="wf-rule">{r.rule}</div>
              </div>
              <div className="wf-right" style={{ minWidth: 160 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    justifyContent: "flex-end",
                  }}
                >
                  <div style={{ flex: 1, maxWidth: 80 }}>
                    <div
                      style={{
                        height: 4,
                        background: "var(--bg3)",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${r.p}%`,
                          background: r.col,
                          borderRadius: 2,
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="wf-amt" style={{ color: r.col }}>
                      {r.over ? "−" : ""}
                      {formatMoney(Math.abs(r.left), base)}
                      {r.over && (
                        <span
                          style={{
                            fontSize: 9,
                            color: "var(--r)",
                            fontWeight: 700,
                          }}
                        >
                          {" "}
                          OVERSPENT
                        </span>
                      )}
                    </div>
                    <div className="wf-pct">
                      of {formatMoney(r.alloc, base)} ·{" "}
                      {view.income > 0
                        ? ((r.alloc / view.income) * 100).toFixed(0)
                        : 0}
                      %
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /** Legacy renderBucketBalances cards */
  function BucketDetail() {
    if (!plan || bucketStates.length === 0) return null;
    return (
      <>
        <div className="sec">
          Bucket spending detail
          {scope === "total" ? " — all time" : " — this month"}
        </div>
        <div id="bucket-balances-card">
          {bucketStates.map((b, i) => {
            const meta = plan.buckets.find((x) => x.id === b.bucketId);
            const alloc = b.opening + b.allocated;
            const spent = b.spent;
            const remaining = b.closing;
            const over = remaining < 0;
            const pctUsed =
              alloc > 0
                ? Math.min(100, (spent / alloc) * 100)
                : spent > 0
                  ? 100
                  : 0;
            const barColor = over
              ? "var(--r)"
              : pctUsed > 85
                ? "var(--y)"
                : "var(--g)";
            const remColor = over
              ? "var(--r)"
              : remaining < alloc * 0.2
                ? "var(--y)"
                : "var(--tx)";
            const wfc = bucketColor(b.bucketId, i);

            // Expenses for this bucket — this month's txs, or all txs for TOTAL
            const scopeTxs =
              scope === "total"
                ? [...historyTransactions, ...transactions]
                : transactions;
            const spentTxs = scopeTxs.filter(
              (t) => t.type === "e" && t.bucketId === b.bucketId
            );

            return (
              <div className="bucket-card" key={b.bucketId}>
                <div className="bucket-row">
                  <div className="bucket-dot" style={{ background: wfc }} />
                  <div className="bucket-name">
                    {meta?.emoji} {meta?.name}
                  </div>
                  <div className="bucket-alloc">
                    Allocated: {formatMoney(alloc, base)}
                  </div>
                  <div className="bucket-remaining" style={{ color: remColor }}>
                    {over ? "−" : "+"}
                    {formatMoney(Math.abs(remaining), base)}
                    {over && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "var(--r)",
                          marginLeft: 4,
                        }}
                      >
                        OVER
                      </span>
                    )}
                  </div>
                </div>
                <div className="bucket-prog">
                  <div
                    className="bucket-prog-fill"
                    style={{ width: `${pctUsed}%`, background: barColor }}
                  />
                </div>
                <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 3 }}>
                  Spent: {formatMoney(spent, base)} of {formatMoney(alloc, base)}
                </div>
                {spentTxs.length > 0 && (
                  <div className="bucket-txs">
                    {spentTxs.map((t) => (
                      <div className="bucket-tx" key={t.id}>
                        <div className="bucket-tx-label">
                          {t.note || t.category || "Expense"}
                          {t.overspend && (
                            <span className="bucket-tx-cross">overspent</span>
                          )}
                          {t.override && (
                            <span className="bucket-tx-cross">cross-bucket</span>
                          )}
                          {t.reason && (
                            <div className="bucket-tx-reason">
                              &quot;{t.reason}&quot;
                            </div>
                          )}
                        </div>
                        <div className="bucket-tx-amt">
                          −{formatMoney(t.amount, t.currency as CurrencyCode)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  /** This month's latest rows, each with its edit window or lock */
  function RecentTx() {
    const rows = rowsToShow(transactions, 8);
    return (
      <>
        <div className="sec">Recent transactions</div>
        <div className="card">
          {rows.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No transactions yet"
              description="Log income or an expense to start tracking this month."
              actionLabel="Log transaction"
              onAction={() => setModalOpen(true)}
            />
          ) : (
            <TransactionList rows={rows} {...txListProps} />
          )}
        </div>
      </>
    );
  }

  function HistoryTx() {
    if (historyTransactions.length === 0) return null;
    const rows = rowsToShow(historyTransactions, 20);
    return (
      <>
        <div className="sec">History (past months)</div>
        <div className="card">
          <p style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 10 }}>
            These logs are kept. A transaction you file under an earlier month
            appears here.
          </p>
          <TransactionList rows={rows} {...txListProps} />
        </div>
      </>
    );
  }

  function renderSection(id: DashboardSectionId) {
    switch (id) {
      case "plan_status":
        if (!(onboarding === "skipped" && !plan)) return null;
        return (
          <div className="card" key={id}>
            <p style={{ fontSize: 12, color: "var(--tx2)" }}>
              Plan not set —{" "}
              <Link href="/settings">build your plan in Plan settings</Link>.
            </p>
          </div>
        );
      case "metrics":
        return <div key={id}>{Metrics()}</div>;
      case "charts":
        return <div key={id}>{Charts()}</div>;
      case "bucket_balances":
        return <div key={id}>{BucketBalances()}</div>;
      case "bucket_detail":
        return <div key={id}>{BucketDetail()}</div>;
      case "recent_transactions":
        return <div key={id}>{RecentTx()} {HistoryTx()}</div>;
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

      <SetPasswordPrompt hasPassword={hasPassword} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 12,
        }}
      >
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

      {sections.map((id) => renderSection(id))}
      <ForecastCard />

      <motion.button
        type="button"
        className="fab"
        data-testid="fab"
        title="Log transaction"
        aria-label="Log transaction"
        onClick={() => setModalOpen(true)}
        whileTap={{ scale: 0.93 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </motion.button>

      <LogTransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        plan={plan}
        sources={sources}
        baseCurrency={baseCurrency}
        fx={fx}
        bucketRemaining={bucketRemaining}
        monthIncome={snapshot.income}
      />
    </AppShell>
  );
}
