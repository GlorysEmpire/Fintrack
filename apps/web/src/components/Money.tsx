import { formatMoney, type CurrencyCode } from "@fintrack/domain";
import { cn } from "@/lib/utils";

/** Tabular mono figures for balances and amounts. */
export function Money({
  amount,
  currency,
  className,
  signed,
}: {
  amount: number;
  currency: string;
  className?: string;
  /** Prefix +/− based on sign of amount */
  signed?: boolean;
}) {
  const abs = Math.abs(amount);
  const formatted = formatMoney(abs, currency as CurrencyCode);
  const prefix =
    signed && amount !== 0 ? (amount > 0 ? "+" : "−") : "";
  return (
    <span className={cn("font-mono tabular-nums tracking-tight", className)}>
      {prefix}
      {formatted}
    </span>
  );
}
