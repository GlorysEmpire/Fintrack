import { CURRENCY_SYMBOLS, type CurrencyCode } from "@fintrack/domain";

/** Exact to the kobo/cent (no rounding to whole units). The sign is the caller's to show. */
export function formatExact(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency as CurrencyCode] ?? "";
  return `${sym}${Math.abs(amount).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
