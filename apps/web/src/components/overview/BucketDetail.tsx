import {
  formatMoney,
  type BudgetPlan,
  type CurrencyCode,
  type MonthBucketState,
} from "@fintrack/domain";
import { bucketColor } from "@/lib/bucket-colors";
import type { TxRow } from "@/lib/tx-row";

/** Per-bucket spending cards, with the expenses (and any cross-bucket reason) behind each. */
export function BucketDetail({
  plan,
  states,
  base,
  scope,
  expenses,
}: {
  plan: BudgetPlan | null;
  states: MonthBucketState[];
  base: CurrencyCode;
  scope: "total" | "month";
  /** Transactions for the current scope */
  expenses: TxRow[];
}) {
  if (!plan || states.length === 0) return null;
  return (
    <>
      <div className="sec">
        Bucket spending detail
        {scope === "total" ? " — all time" : " — this month"}
      </div>
      <div id="bucket-balances-card">
        {states.map((b, i) => {
          const meta = plan.buckets.find((x) => x.id === b.bucketId);
          const alloc = b.opening + b.allocated;
          const remaining = b.closing;
          const over = remaining < 0;
          const pctUsed = alloc > 0 ? Math.min(100, (b.spent / alloc) * 100) : b.spent > 0 ? 100 : 0;
          const barColor = over
            ? "var(--color-destructive)"
            : pctUsed > 85
              ? "var(--color-warning)"
              : "var(--color-primary)";
          const remColor = over
            ? "var(--color-destructive)"
            : remaining < alloc * 0.2
              ? "var(--color-warning)"
              : "var(--color-foreground)";
          const spentTxs = expenses.filter((t) => t.type === "e" && t.bucketId === b.bucketId);

          return (
            <div className="bucket-card" key={b.bucketId}>
              <div className="bucket-row">
                <div className="bucket-dot" style={{ background: bucketColor(b.bucketId, i) }} />
                <div className="bucket-name">
                  {meta?.emoji} {meta?.name}
                </div>
                <div className="bucket-alloc">Allocated: {formatMoney(alloc, base)}</div>
                <div className="bucket-remaining" style={{ color: remColor }}>
                  {over ? "−" : "+"}
                  {formatMoney(Math.abs(remaining), base)}
                  {over && <span className="ml-1 text-xs font-bold text-destructive">OVER</span>}
                </div>
              </div>
              <div className="bucket-prog">
                <div
                  className="bucket-prog-fill"
                  style={{ width: `${pctUsed}%`, background: barColor }}
                />
              </div>
              <div className="mt-[3px] text-xs text-subtle">
                Spent: {formatMoney(b.spent, base)} of {formatMoney(alloc, base)}
              </div>
              {spentTxs.length > 0 && (
                <div className="bucket-txs">
                  {spentTxs.map((t) => (
                    <div className="bucket-tx" key={t.id}>
                      <div className="bucket-tx-label">
                        {t.note || t.category || "Expense"}
                        {t.override && <span className="bucket-tx-cross">cross-bucket</span>}
                        {t.reason && <div className="bucket-tx-reason">&quot;{t.reason}&quot;</div>}
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
