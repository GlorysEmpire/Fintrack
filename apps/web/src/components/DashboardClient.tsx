"use client";

/**
 * Overview markup ported from legacy app.js renderOverview() + renderBucketBalances().
 * Class names: m-grid, metric, m-lbl, m-val, m-sub, two-col, card, card-t,
 * chart-wrap, legend, wf-row, wf-dot, wf-name, wf-rule, wf-right, wf-amt, wf-pct,
 * sec, bucket-card, fab — same as FinTrack.html
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Receipt } from "lucide-react";
import {
  formatMoney,
  sortBucketsByCanonicalOrder,
  type BudgetPlan,
  type CurrencyCode,
  type DashboardLayout,
  type DashboardSectionId,
  type MonthBucketState,
  type WaterfallResult,
  visibleSections,
} from "@fintrack/domain";
import { LogTransactionModal } from "./LogTransactionModal";
import { DashboardCharts } from "./DashboardCharts";
import { DashboardCustomize } from "./DashboardCustomize";
import { AppShell } from "./AppShell";
import { EmptyState } from "./EmptyState";
import { Money } from "./Money";
import { SetPasswordPrompt } from "./SetPasswordPrompt";
import { bucketColor } from "@/lib/bucket-colors";
import { formatTxDate } from "@/lib/format-date";
import { useCountUp } from "@/hooks/useCountUp";

type Tx = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  bucketId: string | null;
  sourceId: string | null;
  category: string | null;
  note: string | null;
  reason: string | null;
  override: boolean;
  date: string;
};

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
  sampleWaterfall: WaterfallResult | null;
  transactions: Tx[];
  historyTransactions?: Tx[];
  inboxUnread: number;
  daysLeft: number;
  layout: DashboardLayout;
  /** Optional next-month projection (Phase 4) */
  forecastNext?: {
    gross: number;
    lines: { bucketId: string; name: string; emoji: string; allocated: number }[];
  } | null;
};

function ruleForBucket(meta: { mode: string; percent: number } | undefined) {
  if (!meta) return "";
  if (meta.mode === "of_gross") return `${meta.percent}% of gross`;
  if (meta.mode === "of_remaining") return `${meta.percent}% of post-tithe`;
  return `${meta.percent}% of remainder`;
}

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
    sampleWaterfall,
    transactions,
    historyTransactions = [],
    inboxUnread,
    daysLeft,
    layout,
    forecastNext = null,
  } = props;
  void onboarding;
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const base = baseCurrency as CurrencyCode;

  const actual = snapshot.income;
  const incomeAnim = useCountUp(actual);
  const expenseAnim = useCountUp(snapshot.expenses);
  const netAnim = useCountUp(Math.abs(snapshot.net));
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
      for (const p of plan.buckets) {
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

  async function deleteTx(id: string) {
    if (!confirm("Delete this transaction?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(null);
    }
  }

  const bucketLabel = (id: string | null) => {
    if (!id || !plan) return "Expense";
    const b = plan.buckets.find((x) => x.id === id);
    return b ? `${b.emoji} ${b.name}` : id;
  };

  const sourceLabel = (id: string | null) => {
    if (!id) return "💵 Income";
    const s = sources.find((x) => x.id === id);
    return s ? `${s.emoji} ${s.name}` : "💵 Income";
  };

  /** Overview metrics with odometer count-up */
  function Metrics() {
    return (
      <div className="m-grid">
        <div className="metric">
          <div className="m-lbl">Income logged</div>
          <div className="m-val">
            <Money amount={incomeAnim} currency={base} />
          </div>
          <div className="m-sub">actual this month</div>
        </div>
        <div className="metric">
          <div className="m-lbl">Total expenses</div>
          <div className="m-val" style={{ color: "var(--r)" }}>
            <Money amount={expenseAnim} currency={base} />
          </div>
          <div className="m-sub">all buckets combined</div>
        </div>
        <div className="metric">
          <div className="m-lbl">Net remaining</div>
          <div
            className="m-val"
            style={{ color: snapshot.net >= 0 ? "var(--g)" : "var(--r)" }}
          >
            <Money amount={netAnim} currency={base} />
          </div>
          <div className="m-sub">
            {snapshot.net >= 0 ? "available" : "over budget"}
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
              — allocated vs remaining after expenses
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--tx3)" }}>
            <Link href="/settings">Set a plan</Link> to track buckets.
          </p>
        </div>
      );
    }

    const orderedPlan = sortBucketsByCanonicalOrder(plan.buckets);
    const byId = new Map(snapshot.buckets.map((b) => [b.bucketId, b]));
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
        rule: ruleForBucket(meta),
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
            — allocated vs remaining after expenses
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
                      {formatMoney(Math.max(0, r.left), base)}
                      {r.over && (
                        <span
                          style={{
                            fontSize: 9,
                            color: "var(--r)",
                            fontWeight: 700,
                          }}
                        >
                          {" "}
                          OVER
                        </span>
                      )}
                    </div>
                    <div className="wf-pct">
                      of {formatMoney(r.alloc, base)} ·{" "}
                      {actual > 0
                        ? ((r.alloc / actual) * 100).toFixed(0)
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
    if (!plan || snapshot.buckets.length === 0) return null;
    return (
      <>
        <div className="sec">Bucket spending detail</div>
        <div id="bucket-balances-card">
          {snapshot.buckets.map((b, i) => {
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

            // Expenses for this bucket from month txs
            const spentTxs = transactions.filter(
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

  /** Recent rows with staggered enter */
  function RecentTx() {
    const rows = transactions.slice(0, 8);
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
            rows.map((t, i) => (
              <motion.div
                className="tx-item"
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <div>
                  <div className="tx-name">
                    {t.type === "i"
                      ? sourceLabel(t.sourceId)
                      : bucketLabel(t.bucketId)}
                    {t.note ? (
                      <span className="tx-note"> · {t.note}</span>
                    ) : null}
                    {t.bucketId && t.type === "e" && (
                      <span
                        style={{
                          fontSize: 9,
                          background: "var(--bg3)",
                          padding: "1px 5px",
                          borderRadius: 4,
                          color: "var(--tx3)",
                          marginLeft: 4,
                        }}
                      >
                        {bucketLabel(t.bucketId)}
                      </span>
                    )}
                  </div>
                  <div className="tx-meta">{formatTxDate(t.date)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className={t.type === "i" ? "amt-pos" : "amt-neg"}>
                    <Money
                      amount={t.type === "i" ? t.amount : -t.amount}
                      currency={t.currency}
                      signed
                    />
                  </div>
                  <button
                    type="button"
                    className="tx-del"
                    disabled={deleting === t.id}
                    onClick={() => deleteTx(t.id)}
                  >
                    ×
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </>
    );
  }

    function HistoryTx() {
    if (historyTransactions.length === 0) return null;
    const rows = historyTransactions.slice(0, 20);
    return (
      <>
        <div className="sec">History (past months)</div>
        <div className="card">
          <p style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 10 }}>
            These logs are kept. Overview above is this month only.
          </p>
          {rows.map((t) => (
            <div className="tx-item" key={t.id}>
              <div>
                <div className="tx-name">
                  {t.type === "i"
                    ? sourceLabel(t.sourceId)
                    : bucketLabel(t.bucketId)}
                  {t.note ? (
                    <span className="tx-note"> · {t.note}</span>
                  ) : null}
                </div>
                <div className="tx-meta">{formatTxDate(t.date)}</div>
              </div>
              <div className={t.type === "i" ? "amt-pos" : "amt-neg"}>
                <Money
                  amount={t.type === "i" ? t.amount : -t.amount}
                  currency={t.currency}
                  signed
                />
              </div>
            </div>
          ))}
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
              <Link href="/settings">choose a template in Plan settings</Link>.
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
      />
    </AppShell>
  );
}
