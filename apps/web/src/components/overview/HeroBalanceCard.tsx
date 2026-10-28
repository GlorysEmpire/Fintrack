"use client";

import { ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { formatMoney, type CurrencyCode, type SafeToSpend } from "@fintrack/domain";
import { CountUp } from "@/components/motion/CountUp";
import { InfoTip } from "@/components/ui/info-tip";
import { useLogSheet } from "../log/LogSheetProvider";
import { durations, ease } from "@/lib/motion";

type Props = {
  base: CurrencyCode;
  /** From the domain's safeToSpend(): this month's Spend bucket */
  safe: SafeToSpend;
  /** Net of everything not yet spent this month; shown when the plan has no Spend bucket */
  monthNet: number;
  /** All income minus all expenses, ever */
  netTotal: number;
  daysLeft: number;
  /** Any income logged this month */
  hasIncome: boolean;
};

/** "Safe to spend": the one number to open the app for, with a plain-language why. */
export function HeroBalanceCard({
  base,
  safe,
  monthNet,
  netTotal,
  daysLeft,
  hasIncome,
}: Props) {
  const reduce = useReducedMotion();
  const { open: openLog } = useLogSheet();
  const hasSpend = safe.hasSpendBucket;
  const value = hasSpend ? safe.amount : Math.max(0, monthNet);
  const fraction = safe.fraction;
  const perDay = hasSpend ? safe.perDay : daysLeft > 0 ? value / daysLeft : 0;

  return (
    <div className="mb-4 rounded-2xl bg-[image:var(--gradient-money)] p-px shadow-[var(--glow-primary)]">
      <div className="relative rounded-[calc(var(--radius-xl)-1px)] bg-card p-5 md:p-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <div
            className="absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-60 blur-3xl"
            style={{ background: "var(--color-primary-soft)" }}
          />
        </div>
        <div className="relative grid gap-5 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <div className="flex items-center gap-2 text-label font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              {hasSpend ? "Safe to spend" : "Left this month"}
              <InfoTip label="About safe to spend">
                {hasSpend
                  ? "Your income is split into buckets, like Tithe, Save and Invest. Spend is the bucket you can use for anything day to day, and the rest is already set aside for its purpose. So this is the amount you can spend today without touching the rest of your plan."
                  : "Everything you have logged this month, minus what you have already spent."}
              </InfoTip>
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
                onClick={() => openLog({ type: "i" })}
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
                    {formatMoney(safe.amount, base)} of {formatMoney(safe.total, base)}
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

      </div>
    </div>
  );
}
