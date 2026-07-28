"use client";

/**
 * Budget donut + legend + progress — pure SVG (no new chart dep).
 * Colors from CSS variables via getComputedStyle when possible.
 */
import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { Money } from "@/components/Money";
import { cn } from "@/lib/utils";

export type BudgetSlice = {
  id: string;
  name: string;
  spent: number;
  alloc: number;
  colorVar: string;
};

function readColor(varName: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return v || fallback;
}

const FALLBACKS = [
  "oklch(0.75 0.16 235)",
  "oklch(0.70 0.20 290)",
  "oklch(0.82 0.15 200)",
  "oklch(0.78 0.17 160)",
  "oklch(0.72 0.16 350)",
  "oklch(0.82 0.12 95)",
];

export function BudgetOverviewPanel({
  slices,
  currency,
  className,
}: {
  slices: BudgetSlice[];
  currency: string;
  className?: string;
}) {
  const [colors, setColors] = useState<string[]>(FALLBACKS);

  useEffect(() => {
    setColors(
      slices.map((s, i) =>
        readColor(s.colorVar, FALLBACKS[i % FALLBACKS.length])
      )
    );
  }, [slices]);

  // Remaining balances (allocated − spent), not spent totals
  const withRemaining = slices.map((s) => ({
    ...s,
    remaining: Math.max(0, s.alloc - s.spent),
  }));
  const totalAlloc = withRemaining.reduce((s, x) => s + x.alloc, 0);
  const totalSpent = withRemaining.reduce((s, x) => s + x.spent, 0);
  const totalRemaining = withRemaining.reduce((s, x) => s + x.remaining, 0);
  const pct =
    totalAlloc > 0
      ? Math.min(100, Math.round((totalSpent / totalAlloc) * 100))
      : 0;
  const left = Math.max(0, totalAlloc - totalSpent);

  const arcs = useMemo(() => {
    const r = 54;
    const c = 2 * Math.PI * r;
    let offset = 0;
    const base = totalRemaining > 0 ? totalRemaining : 1;
    return withRemaining.map((s, i) => {
      const share = s.remaining / base;
      const len = share * c * 0.75;
      const dash = `${len} ${c - len}`;
      const o = offset;
      offset += len;
      return { dash, offset: -o, color: colors[i] || FALLBACKS[0], id: s.id };
    });
  }, [withRemaining, colors, totalRemaining]);

  return (
    <GlassCard
      motionEnter
      className={cn("flex h-full flex-col p-4 sm:p-5", className)}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Income allocation (remaining)
        </h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          This month
        </span>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
        <div className="relative mx-auto h-[140px] w-[140px]">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
            <circle
              cx="70"
              cy="70"
              r="54"
              fill="none"
              stroke="var(--border)"
              strokeWidth="12"
              strokeDasharray={`${2 * Math.PI * 54 * 0.75} ${2 * Math.PI * 54}`}
              strokeLinecap="round"
            />
            {totalRemaining > 0 &&
              arcs.map((a) => (
                <circle
                  key={a.id}
                  cx="70"
                  cy="70"
                  r="54"
                  fill="none"
                  stroke={a.color}
                  strokeWidth="12"
                  strokeDasharray={a.dash}
                  strokeDashoffset={a.offset}
                  strokeLinecap="round"
                />
              ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-display text-xl tabular-nums text-foreground">
              <Money amount={totalRemaining} currency={currency} />
            </span>
            <span className="max-w-[90px] text-[10px] text-muted-foreground">
              remaining
            </span>
          </div>
        </div>

        <ul className="flex max-h-[200px] flex-col gap-2 overflow-y-auto">
          {withRemaining.slice(0, 8).map((s, i) => {
            const share =
              totalRemaining > 0
                ? Math.round((s.remaining / totalRemaining) * 100)
                : 0;
            return (
              <li
                key={s.id}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: colors[i] || FALLBACKS[0] }}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {s.name}
                </span>
                <span className="tabular-nums" data-money>
                  <Money amount={s.remaining} currency={currency} />
                </span>
                <span className="w-8 text-right tabular-nums">{share}%</span>
              </li>
            );
          })}
          {slices.length === 0 && (
            <li className="text-xs text-muted-foreground">
              Log income to fund buckets. Remaining starts at 0.
            </li>
          )}
        </ul>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span>
            <Money amount={totalSpent} currency={currency} /> spent of{" "}
            <Money amount={totalAlloc} currency={currency} />
          </span>
          <span className="text-primary">
            <Money amount={left} currency={currency} /> left
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: "var(--gradient-primary)",
            }}
          />
        </div>
      </div>
    </GlassCard>
  );
}
