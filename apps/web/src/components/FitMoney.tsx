"use client";

import { formatMoney, type CurrencyCode } from "@fintrack/domain";
import { formatCompactMoney } from "@/lib/format-compact";
import { FitText } from "./FitText";

/** A money amount that always fits its card: shrinks, then shortens (₦1.28M), never overflows. */
export function FitMoney({
  amount,
  currency,
  className,
  signed,
}: {
  amount: number;
  currency: string;
  className?: string;
  /** Prefix + or − by the sign of the amount */
  signed?: boolean;
}) {
  const prefix = signed && amount !== 0 ? (amount > 0 ? "+" : "−") : "";
  const full = `${prefix}${formatMoney(Math.abs(amount), currency as CurrencyCode)}`;
  return (
    <FitText
      className={`font-display tabular-nums tracking-tight ${className ?? ""}`}
      text={full}
      compact={`${prefix}${formatCompactMoney(amount, currency)}`}
      full={full}
    />
  );
}
