import type { WaterfallResult } from "@fintrack/domain";
import { DashboardCharts } from "../DashboardCharts";

/** Charts show remaining balances (not total allocated); empty until income is logged. */
export function CashflowChartCard({
  waterfall,
  baseCurrency,
}: {
  waterfall: WaterfallResult | null;
  baseCurrency: string;
}) {
  if (!waterfall || waterfall.gross <= 0) {
    return (
      <div className="two-col">
        <div className="card">
          <div className="card-t">📊 Income allocation (remaining)</div>
          <p className="text-xs text-subtle">
            Log income to fund buckets. Remaining starts at 0.
          </p>
        </div>
        <div className="card">
          <div className="card-t">📈 Monthly cash flow</div>
          <p className="text-xs text-subtle">Log income to populate charts.</p>
        </div>
      </div>
    );
  }
  return <DashboardCharts waterfall={waterfall} baseCurrency={baseCurrency} remainingMode />;
}
