"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, CalendarClock, Receipt } from "lucide-react";
import { activeBuckets, amountInBase, formatMoney, sortBucketsByPlanOrder, type BudgetPlan, type CurrencyCode } from "@fintrack/domain";
import { cn } from "@/lib/utils";
import type { TxRow } from "@/lib/tx-row";
import { EmptyState } from "./EmptyState";
import { TransactionList } from "./TransactionList";
import { useLogSheet } from "./log/LogSheetProvider";
import { MetricCard } from "./overview/MetricCard";
import type { AccountOption } from "./log/types";

function Upcoming({ items }: { items: NonNullable<Parameters<typeof ExpensesView>[0]["upcoming"]> }) {
  if (items.length === 0) return null;
  const fmt = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d)));
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Upcoming recurring expenses" role="group">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Next due
      </span>
      {items.map((r) => (
        <span key={r.id} className="rounded-full border border-border bg-muted px-3 py-1.5 text-sm">
          {r.note || "Recurring expense"} · {formatMoney(r.amount, r.currency as CurrencyCode)} · {fmt(r.nextDate)}
        </span>
      ))}
    </div>
  );
}

/** This month's expenses: a total, filter chips by bucket, and the list itself. */
export function ExpensesView({
  rows,
  plan,
  accounts,
  baseCurrency,
  fx,
  serverNow,
  upcoming = [],
}: {
  rows: TxRow[];
  plan: BudgetPlan | null;
  accounts: AccountOption[];
  baseCurrency: string;
  fx: Record<string, number>;
  serverNow: string;
  /** The next few active recurring expenses, soonest first */
  upcoming?: { id: string; note: string | null; amount: number; currency: string; nextDate: string }[];
}) {
  const { open: openLog } = useLogSheet();
  const [bucket, setBucket] = useState<string>("all");
  const base = baseCurrency as CurrencyCode;

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.bucketId ?? "", (counts.get(r.bucketId ?? "") ?? 0) + 1);
    const known = plan ? sortBucketsByPlanOrder(activeBuckets(plan.buckets)) : [];
    const list = known.filter((b) => counts.has(b.id)).map((b) => ({ id: b.id, label: `${b.emoji} ${b.name}`, count: counts.get(b.id) ?? 0 }));
    const unfiled = counts.get("") ?? 0;
    if (unfiled > 0) list.push({ id: "", label: "No bucket", count: unfiled });
    return list;
  }, [rows, plan]);

  const shown = bucket === "all" ? rows : rows.filter((r) => (r.bucketId ?? "") === bucket);
  const total = shown.reduce((s, t) => s + amountInBase(t.amount, t.currency, baseCurrency, fx), 0);

  if (rows.length === 0) {
    return (
      <>
      <Upcoming items={upcoming} />
      <div className="card">
        <EmptyState
          icon={Receipt}
          title="No expenses yet"
          description="Expenses you log this month appear here."
          actionLabel="Log an expense"
          onAction={() => openLog()}
        />
      </div>
      </>
    );
  }

  return (
    <>
      <Upcoming items={upcoming} />
      <div className="m-grid">
        <MetricCard icon={ArrowUpRight} chipClassName="bg-destructive/12 text-destructive" label="Spent" sub={`${shown.length} ${shown.length === 1 ? "expense" : "expenses"}`} valueClassName="text-destructive">
          {formatMoney(total, base)}
        </MetricCard>
      </div>

      {chips.length > 1 && (
        <div role="group" aria-label="Filter by bucket" className="mb-3 flex flex-wrap gap-2">
          {[{ id: "all", label: "All", count: rows.length }, ...chips].map((c) => (
            <button
              key={c.id || "none"}
              type="button"
              aria-pressed={bucket === c.id}
              onClick={() => setBucket(c.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                bucket === c.id ? "border-primary bg-primary/12 text-primary" : "border-border bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {c.label} <span className="text-xs opacity-70">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <TransactionList rows={shown} plan={plan} sources={[]} accounts={accounts} baseCurrency={baseCurrency} fx={fx} serverNow={serverNow} />
      </div>
    </>
  );
}
