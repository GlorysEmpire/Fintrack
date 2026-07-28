"use client";

import { Eye, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { Money } from "@/components/Money";
import { WaterfallCanvas } from "./WaterfallCanvas";
import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";

/**
 * Hero: large money figure + particle waterfall.
 * Uses this-month income as the featured total (no separate net-worth ledger yet).
 */
export function NetWorthHero({
  total,
  currency,
  deltaPct,
  className,
}: {
  total: number;
  currency: string;
  /** % vs prior period when known; omit to hide chip */
  deltaPct?: number | null;
  className?: string;
}) {
  const anim = useCountUp(total, 1200);
  const ticks = buildTicks(total);

  return (
    <GlassCard
      motionEnter
      className={cn(
        "relative overflow-hidden p-5 sm:p-6 min-h-[280px] sm:min-h-[320px]",
        className
      )}
    >
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="font-medium text-foreground">This month</span>
          </div>
          <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
            All sources
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          Total income
          <Eye className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </div>

        <div className="mt-1 flex flex-wrap items-end gap-4">
          <p
            className="font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-none tracking-tight text-foreground"
            data-money
          >
            <Money amount={anim} currency={currency} />
          </p>
          {deltaPct != null && Number.isFinite(deltaPct) && (
            <span
              className={cn(
                "mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                deltaPct >= 0
                  ? "bg-success/15 text-success"
                  : "bg-destructive/15 text-destructive"
              )}
            >
              {deltaPct >= 0 ? "↑" : "↓"} {Math.abs(deltaPct).toFixed(1)}% vs
              last month
            </span>
          )}
        </div>

        <div className="relative mt-4 min-h-[140px] flex-1">
          <WaterfallCanvas className="absolute inset-0 h-full w-full" />
          {/* faint scale ticks */}
          <div
            className="pointer-events-none absolute right-0 top-2 bottom-6 flex flex-col justify-between text-[10px] tabular-nums text-muted-foreground/50"
            aria-hidden
          >
            {ticks.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function buildTicks(total: number): string[] {
  const top = Math.max(total * 1.15, 1000);
  const steps = 4;
  const out: string[] = [];
  for (let i = 0; i < steps; i++) {
    const v = top * (1 - i / (steps - 1));
    if (v >= 1000) out.push(`${Math.round(v / 1000)}K`);
    else out.push(String(Math.round(v)));
  }
  return out;
}
