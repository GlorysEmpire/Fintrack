"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Percent,
  TrendingUp,
} from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { Money } from "@/components/Money";
import { Sparkline, sparkFromSeed } from "./Sparkline";
import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";

function KpiTile({
  title,
  amount,
  currency,
  isPercent,
  tone,
  seed,
}: {
  title: string;
  amount: number;
  currency?: string;
  isPercent?: boolean;
  tone: "success" | "danger" | "primary" | "cyan";
  seed: number;
}) {
  const anim = useCountUp(amount, 1200);
  const Icon =
    tone === "success"
      ? ArrowUpRight
      : tone === "danger"
        ? ArrowDownRight
        : tone === "cyan"
          ? Percent
          : TrendingUp;

  return (
    <GlassCard motionEnter interactive className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              tone === "success" && "bg-success/15 text-success",
              tone === "danger" && "bg-destructive/15 text-destructive",
              tone === "primary" && "bg-primary/15 text-primary",
              tone === "cyan" &&
                "bg-[color-mix(in_oklab,var(--accent-cyan)_18%,transparent)] text-[var(--accent-cyan)]"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            {title}
          </span>
        </div>
        <Sparkline
          values={sparkFromSeed(amount + seed)}
          tone={
            tone === "success"
              ? "success"
              : tone === "danger"
                ? "danger"
                : tone === "cyan"
                  ? "cyan"
                  : "primary"
          }
        />
      </div>
      <div
        className="mt-3 font-display text-2xl tracking-tight text-foreground"
        data-money
      >
        {isPercent ? (
          <span className="tabular-nums">{anim.toFixed(1)}%</span>
        ) : (
          <Money amount={anim} currency={currency || "NGN"} />
        )}
      </div>
    </GlassCard>
  );
}

export function KpiRow({
  income,
  expenses,
  savingsRate,
  investments,
  currency,
}: {
  income: number;
  expenses: number;
  savingsRate: number;
  investments: number;
  currency: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        title="Income"
        amount={income}
        currency={currency}
        tone="success"
        seed={1}
      />
      <KpiTile
        title="Expenses"
        amount={expenses}
        currency={currency}
        tone="danger"
        seed={2}
      />
      <KpiTile
        title="Savings rate"
        amount={savingsRate}
        isPercent
        tone="cyan"
        seed={3}
      />
      <KpiTile
        title="Investments"
        amount={investments}
        currency={currency}
        tone="primary"
        seed={4}
      />
    </div>
  );
}
