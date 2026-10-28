"use client";

import { useMemo, useState } from "react";
import { LineChart, PieChart } from "lucide-react";
import type { CurrencyCode, WaterfallResult } from "@fintrack/domain";
import { AllocationChart, CashflowChart } from "../DashboardCharts";
import { monthlySeries, type SeriesTx } from "@/lib/monthly-series";
import { cn } from "@/lib/utils";
import { SectionTitle } from "./SectionTitle";

const RANGES = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
] as const;

/** Allocation donut beside the monthly cash-flow lines; both wait for income to be logged. */
export function CashflowChartCard({
  waterfall,
  rows,
  baseCurrency,
  fx,
  serverNow,
}: {
  waterfall: WaterfallResult | null;
  /** Every transaction, all months */
  rows: SeriesTx[];
  baseCurrency: string;
  fx: Record<string, number>;
  serverNow: string;
}) {
  const [months, setMonths] = useState<number>(6);
  const points = useMemo(
    () => monthlySeries(rows, baseCurrency as CurrencyCode, fx, months, new Date(serverNow)),
    [rows, baseCurrency, fx, months, serverNow]
  );
  const hasFlow = rows.some((t) => t.type === "i" || t.type === "e");
  const hasAllocation = Boolean(waterfall && waterfall.gross > 0);

  return (
    <div className="two-col">
      <div className="card">
        <SectionTitle icon={PieChart}>Income allocation (remaining)</SectionTitle>
        {hasAllocation && waterfall ? (
          <AllocationChart waterfall={waterfall} baseCurrency={baseCurrency} />
        ) : (
          <p className="text-xs text-subtle">Log income to fund buckets. Remaining starts at 0.</p>
        )}
      </div>
      <div className="card">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-card-title font-semibold">
            <LineChart className="h-4 w-4 text-primary" aria-hidden />
            Monthly cash flow
          </div>
          {hasFlow && (
            <div role="group" aria-label="Range" className="flex gap-1 rounded-lg bg-muted p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  aria-pressed={months === r.months}
                  onClick={() => setMonths(r.months)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                    months === r.months ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {hasFlow ? (
          <>
            <CashflowChart points={points} baseCurrency={baseCurrency} />
            <div className="legend">
              <div className="legend-item">
                <div className="legend-dot bg-primary" /> Income
              </div>
              <div className="legend-item">
                <div className="legend-dot bg-destructive" /> Expenses
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-subtle">Log income to populate charts.</p>
        )}
      </div>
    </div>
  );
}
