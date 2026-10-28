import Link from "next/link";
import {
  activeBuckets,
  bucketRuleLabel,
  formatMoney,
  sortBucketsByPlanOrder,
  type BudgetPlan,
  type CurrencyCode,
  type MonthBucketState,
} from "@fintrack/domain";
import { bucketColor } from "@/lib/bucket-colors";

/** Every bucket with what is left, what it started with, and its rule. */
export function BucketWaterfall({
  plan,
  states,
  base,
  income,
  scope,
}: {
  plan: BudgetPlan | null;
  states: MonthBucketState[];
  base: CurrencyCode;
  income: number;
  scope: "total" | "month";
}) {
  const subtitle =
    scope === "total"
      ? "— all-time allocated vs spent"
      : "— allocated vs remaining after expenses";
  const title = (
    <div className="card-t">
      💧 Bucket balances <span className="text-xs font-normal text-subtle">{subtitle}</span>
    </div>
  );

  if (!plan) {
    return (
      <div className="card">
        {title}
        <p className="text-xs text-subtle">
          <Link href="/settings">Set a plan</Link> to track buckets.
        </p>
      </div>
    );
  }

  const byId = new Map(states.map((b) => [b.bucketId, b]));
  const rows = sortBucketsByPlanOrder(activeBuckets(plan.buckets)).map((meta, i) => {
    const b = byId.get(meta.id);
    const alloc = b ? b.opening + b.allocated : 0;
    const spent = b?.spent || 0;
    const left = alloc - spent;
    const over = left < 0;
    const p = alloc > 0 ? Math.min(100, (spent / alloc) * 100) : 0;
    const dot = bucketColor(meta.id, i);
    return {
      id: meta.id,
      emoji: meta.emoji || "",
      name: meta.name || meta.id,
      rule: `${bucketRuleLabel(meta, base)}${meta.carryOver ? " · carries over" : " · resets monthly"}`,
      alloc,
      left,
      over,
      p,
      dot,
      col: over ? "var(--color-destructive)" : p > 85 ? "var(--color-warning)" : dot,
    };
  });

  return (
    <div className="card">
      {title}
      <div className="grid grid-cols-1">
        {rows.map((r) => (
          <div className="wf-row" key={r.id}>
            <div className="wf-dot" style={{ background: r.dot }} />
            <div className="flex-1">
              <div className="wf-name">
                {r.emoji} {r.name}
              </div>
              <div className="wf-rule">{r.rule}</div>
            </div>
            <div className="wf-right min-w-40">
              <div className="flex items-center justify-end gap-2">
                <div className="max-w-20 flex-1">
                  <div className="h-1 overflow-hidden rounded-sm bg-muted">
                    <div
                      className="h-full rounded-sm"
                      style={{ width: `${r.p}%`, background: r.col }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="wf-amt" style={{ color: r.col }}>
                    {r.over ? "−" : ""}
                    {formatMoney(Math.abs(r.left), base)}
                    {r.over && <span className="text-xs font-bold text-destructive"> BELOW ZERO</span>}
                  </div>
                  <div className="wf-pct">
                    of {formatMoney(r.alloc, base)} ·{" "}
                    {income > 0 ? ((r.alloc / income) * 100).toFixed(0) : 0}%
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
