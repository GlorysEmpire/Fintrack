/**
 * Multi-currency helpers.
 * Rates are "how many NGN per 1 unit of currency" by default.
 * Stored per-user in the DB later; domain only does pure conversion.
 */
export type CurrencyCode = "NGN" | "USD" | "GBP" | "EUR";

export const DEFAULT_FX: Record<CurrencyCode, number> = {
  NGN: 1,
  USD: 1580,
  GBP: 1990,
  EUR: 1710,
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
};

/** Convert an amount from one currency into the user's base currency */
export function toBase(
  amount: number,
  from: CurrencyCode,
  base: CurrencyCode,
  fx: Record<string, number> = DEFAULT_FX
): number {
  const fromRate = fx[from] ?? 1;
  const baseRate = fx[base] ?? 1;
  return (amount * fromRate) / baseRate;
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const sym = CURRENCY_SYMBOLS[currency] || "";
  const n = Math.round(Math.abs(amount));
  return `${sym}${n.toLocaleString()}`;
}
