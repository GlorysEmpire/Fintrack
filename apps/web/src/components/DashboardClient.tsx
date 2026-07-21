"use client";

/**
 * Overview markup ported from legacy app.js renderOverview() + renderBucketBalances().
 * Class names: m-grid, metric, m-lbl, m-val, m-sub, two-col, card, card-t,
 * chart-wrap, legend, wf-row, wf-dot, wf-name, wf-rule, wf-right, wf-amt, wf-pct,
 * sec, bucket-card, fab — same as FinTrack.html
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  formatMoney,
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
import { bucketColor } from "@/lib/bucket-colors";
import { formatTxDate } from "@/lib/format-date";

type Tx = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  bucketId: string | null;
  sourceId: string | null;
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
  inboxUnread: number;
  daysLeft: number;
  layout: DashboardLayout;
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
    plan,
    fx,
    sources,
    snapshot,
    sampleWaterfall,
    transactions,
    inboxUnread,
    daysLeft,
    layout,
  } = props;
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const base = baseCurrency as CurrencyCode;

  const actual = snapshot.income;
  const chartWaterfall =
    snapshot.waterfall && actual > 0 ? snapshot.waterfall : sampleWaterfall;

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

  /** Legacy renderOverview metrics block */
  function Metrics() {
    return (
      <div className="m-grid">
        <div className="metric">
          <div className="m-lbl">Income logged</div>
          <div className="m-val">{formatMoney(actual, base)}</div>
          <div className="m-sub">actual this month</div>
        </div>
        <div className="metric">
          <div className="m-lbl">Total expenses</div>
          <div className="m-val" style={{ color: "var(--r)" }}>
            {formatMoney(snapshot.expenses, base)}
          </div>
          <div className="m-sub">all buckets combined</div>
        </div>
        <div className="metric">
          <div className="m-lbl">Net remaining</div>
          <div
            className="m-val"
            style={{ color: snapshot.net >= 0 ? "var(--g)" : "var(--r)" }}
          >
            {formatMoney(Math.abs(snapshot.net), base)}
          </div>
          <div className="m-sub">
            {snapshot.net >= 0 ? "available" : "over budget"}
          </div>
        </div>
        <div className="metric">
          <div className="m-lbl">Days left</div>
          <div className="m-val">{daysLeft}</div>
          <div className="m-sub">in this month</div>
        </div>
      </div>
    );
  }

  /** Legacy two-col charts */
  function Charts() {
    if (!chartWaterfall || chartWaterfall.gross <= 0) {
      return (
        <div className="two-col">
          <div className="card">
            <div className="card-t">📊 Income allocation</div>
            <p style={{ fontSize: 12, color: "var(--tx3)" }}>
              Log income to populate charts.
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
      <>
        {actual === 0 && (
          <p style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 10 }}>
            Sample on ₦100,000 — log income for live numbers.
          </p>
        )}
        <DashboardCharts
          waterfall={chartWaterfall}
          baseCurrency={baseCurrency}
        />
      </>
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
    }[] =
      snapshot.buckets.length > 0
        ? snapshot.buckets.map((b, i) => {
            const meta = plan.buckets.find((x) => x.id === b.bucketId);
            const alloc = b.opening + b.allocated;
            const spent = b.spent;
            const left = alloc - spent;
            const over = left < 0;
            const p = alloc > 0 ? Math.min(100, (spent / alloc) * 100) : 0;
            const wfc = bucketColor(b.bucketId, i);
            const col = over ? "var(--r)" : p > 85 ? "var(--y)" : wfc;
            return {
              id: b.bucketId,
              emoji: meta?.emoji || "",
              name: meta?.name || b.bucketId,
              rule: ruleForBucket(meta),
              alloc,
              spent,
              left,
              over,
              p,
              col,
              wfc,
            };
          })
        : plan.buckets
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((b, i) => ({
              id: b.id,
              emoji: b.emoji,
              name: b.name,
              rule: ruleForBucket(b),
              alloc: 0,
              spent: 0,
              left: 0,
              over: false,
              p: 0,
              col: bucketColor(b.id, i),
              wfc: bucketColor(b.id, i),
            }));

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

  /** Legacy recent rows */
  function RecentTx() {
    const rows = transactions.slice(0, 8);
    return (
      <>
        <div className="sec">Recent transactions</div>
        <div className="card">
          {rows.length === 0 ? (
            <div className="empty">
              <div className="ei">+</div>
              <p>
                No transactions yet.
                <br />
                Click <strong>+</strong> to log income or an expense.
              </p>
            </div>
          ) : (
            rows.map((t) => (
              <div className="tx-item" key={t.id}>
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
                    {t.type === "i" ? "+" : "−"}
                    {formatMoney(t.amount, t.currency as CurrencyCode)}
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
              </div>
            ))
          )}
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
        return <div key={id}>{RecentTx()}</div>;
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

      {/* Same order as legacy renderOverview when all sections visible */}
      {sections.map((id) => renderSection(id))}

      {/* FAB — identical to legacy */}
      <button
        type="button"
        className="fab"
        title="Log transaction"
        onClick={() => setModalOpen(true)}
      >
        ＋
      </button>

      <LogTransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        plan={plan}
        sources={sources}
        baseCurrency={baseCurrency}
        fx={fx}
      />
    </AppShell>
  );
}
