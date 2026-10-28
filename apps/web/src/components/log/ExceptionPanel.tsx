import { formatMoney, type CurrencyCode } from "@fintrack/domain";
import { InfoTip } from "@/components/ui/info-tip";
import type { Shortfall } from "./types";

/**
 * The one way past a bucket that can not cover an expense: the user chooses
 * another bucket to fund exactly the shortfall, writes why, and confirms. It is
 * recorded as a deviation from the plan. Nothing is saved until they confirm.
 */
export function ExceptionPanel({
  shortfall,
  base,
  fundBucket,
  onFundBucket,
  reason,
  onReason,
  confirmed,
  onConfirmed,
  busy,
  onRecord,
}: {
  shortfall: Shortfall;
  base: CurrencyCode;
  fundBucket: string;
  onFundBucket: (id: string) => void;
  reason: string;
  onReason: (v: string) => void;
  confirmed: boolean;
  onConfirmed: (v: boolean) => void;
  busy: boolean;
  onRecord: () => void;
}) {
  const chosen = shortfall.options.find((o) => o.bucketId === fundBucket);
  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3" role="group" aria-label="Fund the missing amount from another bucket">
      <div className="flex items-center gap-2 font-semibold">
        {shortfall.bucketName} is short by {formatMoney(shortfall.short, base)}.
        <InfoTip label="About funding the shortfall">
          You can fund exactly that amount from another bucket. This is a deliberate change to your plan: it is
          recorded, with your reason, and shows as a deviation. Nothing is saved until you confirm.
        </InfoTip>
      </div>
      <label className="mlbl block" htmlFor="fund-bucket">
        Fund it from
      </label>
      <select id="fund-bucket" className="minp" value={fundBucket} onChange={(e) => onFundBucket(e.target.value)}>
        {shortfall.options.map((o) => (
          <option key={o.bucketId} value={o.bucketId}>
            {o.name} ({formatMoney(o.available, base)} available){o.protected ? " · protected bucket" : ""}
          </option>
        ))}
      </select>
      {chosen?.protected && (
        <p className="mt-1.5 text-sm text-destructive" role="status">
          This bucket builds up over time (it carries over). Taking from it sets back money you were saving. Be sure.
        </p>
      )}
      <label className="mlbl block" htmlFor="fund-reason">
        Why? (required)
      </label>
      <input
        id="fund-reason"
        className="minp"
        maxLength={500}
        placeholder="e.g. Car repair could not wait"
        value={reason}
        onChange={(e) => onReason(e.target.value)}
      />
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => onConfirmed(e.target.checked)} />
        <span>
          I understand this moves {formatMoney(shortfall.short, base)} from my {chosen?.name ?? "other"} bucket and is
          recorded as a change to my plan.
        </span>
      </label>
      <button
        type="button"
        className="mt-3 h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy || !confirmed || reason.trim().length < 3}
        onClick={onRecord}
      >
        Record with this exception
      </button>
    </div>
  );
}
