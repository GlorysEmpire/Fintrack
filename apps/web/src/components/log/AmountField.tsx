"use client";

import { Delete } from "lucide-react";
import type { CurrencyCode } from "@fintrack/domain";
import { CURRENCIES } from "./useLogForm";
import { useIsPhone } from "./useIsPhone";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

/** Keep digits and one decimal point, at most two decimals */
export function cleanAmount(raw: string): string {
  const s = raw.replace(/[^\d.]/g, "");
  const [whole, ...rest] = s.split(".");
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join("").slice(0, 2)}`;
}

/**
 * A big amount with its currency. On a phone the on-screen keypad types it (the
 * phone's own keyboard stays down); on a bigger screen it is a normal field.
 */
export function AmountField({
  amount,
  onAmount,
  currency,
  onCurrency,
  hint,
}: {
  amount: string;
  onAmount: (v: string) => void;
  currency: CurrencyCode;
  onCurrency: (c: CurrencyCode) => void;
  hint: string;
}) {
  const phone = useIsPhone();

  function press(k: (typeof KEYS)[number]) {
    if (k === "del") onAmount(amount.slice(0, -1));
    else onAmount(cleanAmount(amount + k));
  }

  return (
    <div>
      <label className="mlbl mt-4 block" htmlFor="tx-amount">
        Amount
      </label>
      <div className="flex items-center gap-2">
        <input
          id="tx-amount"
          name="amount"
          type="text"
          inputMode={phone ? "none" : "decimal"}
          autoComplete="off"
          placeholder="0"
          value={amount}
          onChange={(e) => onAmount(cleanAmount(e.target.value))}
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-border bg-muted px-4 py-3 font-display text-4xl font-bold tabular-nums outline-none focus:border-primary"
        />
        <select
          aria-label="Currency"
          value={currency}
          onChange={(e) => onCurrency(e.target.value as CurrencyCode)}
          className="h-[3.25rem] rounded-xl border border-border bg-muted px-2 text-sm outline-none focus:border-primary"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-1 min-h-4 text-xs text-subtle">{hint}</div>

      {phone && (
        <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Number pad">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              aria-label={k === "del" ? "Delete last digit" : k === "." ? "Decimal point" : k}
              className="flex h-11 items-center justify-center rounded-xl bg-muted font-display text-xl font-semibold active:bg-border focus-visible:outline-2 focus-visible:outline-ring"
            >
              {k === "del" ? <Delete className="h-5 w-5" aria-hidden /> : k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
