import { CURRENCY_SYMBOLS, type CurrencyCode } from "@fintrack/domain";

const UNITS: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

/**
 * A short form of an amount for a space too small for the whole number:
 * ₦1.28M, ₦950K, ₦12.3K. Under a thousand it stays whole. The full amount is
 * always available as the element's title, so nothing is lost, only shortened.
 */
export function formatCompactMoney(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency as CurrencyCode] ?? "";
  const n = Math.abs(amount);
  const unit = UNITS.find(([size]) => n >= size);
  if (!unit) return `${sym}${Math.round(n).toLocaleString("en-NG")}`;
  const v = n / unit[0];
  const decimals = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  const fixed = v.toFixed(decimals);
  const text = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return `${sym}${text}${unit[1]}`;
}
