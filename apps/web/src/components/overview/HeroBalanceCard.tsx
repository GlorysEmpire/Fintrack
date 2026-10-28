"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { formatMoney, type CurrencyCode } from "@fintrack/domain";
import { CountUp } from "@/components/motion/CountUp";
import { durations, ease } from "@/lib/motion";

type Props = {
  base: CurrencyCode;
  /** What is left in the Spend bucket this month; null when the plan has none */
  spendLeft: number | null;
  /** What Spend started the month with */
  spendTotal: number;
  /** Net of everything not yet spent this month; shown when the plan has no Spend bucket */
  monthNet: number;
  /** All income minus all expenses, ever */
  netTotal: number;
  daysLeft: number;
  /** Any income logged this month */
  hasIncome: boolean;
  onLogIncome: () => void;
};

/** "Safe to spend": the one number to open the app for, with a plain-language why. */
export function HeroBalanceCard({
  base,
  spendLeft,
  spendTotal,
  monthNet,
  netTotal,
  daysLeft,
  hasIncome,
  onLogIncome,
}: Props) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const hasSpend = spendLeft !== null;
  const value = Math.max(0, hasSpend ? spendLeft : monthNet);
  const fraction = hasSpend && spendTotal > 0 ? Math.max(0, Math.min(1, spendLeft / spendTotal)) : 0;
  const perDay = daysLeft > 0 && value > 0 ? value / daysLeft : 0;

  return (
    <div className="mb-4 rounded-2xl bg-[image:var(--gradient-money)] p-px shadow-[var(--glow-primary)]">
      <div className="relative overflow-hidden rounded-[calc(var(--radius-xl)-1px)] bg-card p-5 md:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-60 blur-3xl"
          style={{ background: "var(--color-primary-soft)" }}
        />
        <div className="relative grid gap-5 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <div className="flex items-center gap-2 text-label font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              {hasSpend ? "Safe to spend" : "Left this month"}
            </div>
            <div className="font-display text-hero font-bold tabular-nums tracking-tight text-primary md:bg-[image:var(--gradient-money)] md:bg-clip-text md:text-transparent">
              <CountUp value={value} currency={base} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground" id="hero-sub">
              {!hasIncome && value === 0
                ? "Log your income to see what you can spend."
                : value === 0
                  ? hasSpend
                    ? "Your Spend bucket is empty for now."
                    : "Nothing left this month."
                  : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left this month${
                      perDay > 0 ? ` · about ${formatMoney(perDay, base)} a day` : ""
                    }`}
            </p>
            {!hasIncome && (
              <button
                type="button"
                onClick={onLogIncome}
                className="mt-3 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Log income
              </button>
            )}
          </div>

          <div className="space-y-3">
            {hasSpend && (
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Spend bucket left</span>
                  <span className="tabular-nums">
                    {formatMoney(Math.max(0, spendLeft), base)} of {formatMoney(spendTotal, base)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Spend bucket left" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
                  <motion.div
                    className="h-full rounded-full bg-[image:var(--gradient-money)]"
                    initial={{ width: reduce ? `${fraction * 100}%` : 0 }}
                    animate={{ width: `${fraction * 100}%` }}
                    transition={{ duration: reduce ? 0 : durations.hero, ease: ease.out }}
                  />
                </div>
              </div>
            )}
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Net across all buckets</span>
              <span className="font-display font-semibold tabular-nums">
                {netTotal < 0 ? "−" : ""}
                {formatMoney(Math.abs(netTotal), base)}
              </span>
            </div>
          </div>
        </div>

        <div className="relative mt-4 border-t border-border pt-3">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="hero-explain"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            What does safe to spend mean?
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {open && (
            <p id="hero-explain" className="mt-2 max-w-prose text-sm text-muted-foreground">
              Your income is split into buckets, like Tithe, Save and Invest. Spend is the bucket you can use for anything
              day to day, and the rest is already set aside for its purpose. So this is the amount you can spend today
              without touching the rest of your plan.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
