"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Receipt } from "lucide-react";
import Link from "next/link";
import { GlassCard } from "@/components/GlassCard";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { formatTxDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export type DashTx = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  bucketId: string | null;
  sourceId: string | null;
  category: string | null;
  note: string | null;
  date: string;
};

function initialCircle(label: string, income: boolean) {
  const ch = (label.trim()[0] || "?").toUpperCase();
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
        income
          ? "bg-success/15 text-success"
          : "bg-primary/15 text-primary"
      )}
      aria-hidden
    >
      {ch}
    </span>
  );
}

function categoryPill(label: string, income: boolean) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        income
          ? "bg-success/15 text-success"
          : "bg-[color-mix(in_oklab,var(--accent-violet)_18%,transparent)] text-[var(--accent-violet)]"
      )}
    >
      {label}
    </span>
  );
}

export function RecentTransactionsPanel({
  rows,
  labelFor,
  onDelete,
  deleting,
  onLog,
}: {
  rows: DashTx[];
  labelFor: (t: DashTx) => { title: string; category: string };
  onDelete: (id: string) => void;
  deleting: string | null;
  onLog: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <GlassCard motionEnter className="flex h-full flex-col p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Recent transactions
        </h2>
        <Link
          href="/expenses"
          className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          View all
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Log income or an expense to start tracking this month."
          actionLabel="Log transaction"
          onAction={onLog}
        />
      ) : (
        <ul className="flex flex-col">
          {rows.map((t, i) => {
            const { title, category } = labelFor(t);
            const income = t.type === "i";
            return (
              <motion.li
                key={t.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.35 }}
                className="group flex items-center gap-3 border-b border-border py-3 last:border-0"
              >
                {initialCircle(title, income)}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {title}
                    {t.note ? (
                      <span className="text-muted-foreground"> · {t.note}</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    {categoryPill(category, income)}
                    <span className="text-[11px] text-muted-foreground">
                      {formatTxDate(t.date)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-display text-sm tabular-nums",
                      income ? "text-success" : "text-destructive"
                    )}
                    data-money
                  >
                    <Money
                      amount={income ? t.amount : -t.amount}
                      currency={t.currency}
                      signed
                    />
                  </span>
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={deleting === t.id}
                    onClick={() => onDelete(t.id)}
                    aria-label="Delete transaction"
                  >
                    ×
                  </button>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-60"
                    aria-hidden
                  />
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
