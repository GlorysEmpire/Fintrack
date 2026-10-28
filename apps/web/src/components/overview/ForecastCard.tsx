import type { CurrencyCode } from "@fintrack/domain";
import { Money } from "@/components/Money";
import { bucketColor } from "@/lib/bucket-colors";

export type Forecast = {
  gross: number;
  lines: { bucketId: string; name: string; emoji: string; allocated: number }[];
};

export function ForecastCard({ forecast, base }: { forecast: Forecast | null; base: CurrencyCode }) {
  if (!forecast || forecast.gross <= 0) return null;
  return (
    <div className="card glass-card">
      <div className="card-t">Next month projection</div>
      <p className="m-sub mb-2.5">
        Based on this month&apos;s income pattern + recurring rules
      </p>
      <div className="m-val mb-3">
        <Money amount={forecast.gross} currency={base} />
      </div>
      <div className="legend">
        {forecast.lines.slice(0, 6).map((l, i) => (
          <div className="legend-item" key={l.bucketId}>
            <div className="legend-dot" style={{ background: bucketColor(l.bucketId, i) }} />
            {l.emoji} {l.name}: <Money amount={l.allocated} currency={base} />
          </div>
        ))}
      </div>
    </div>
  );
}
