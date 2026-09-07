import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterMonthTxs, transactionTotals, type MoneyTx } from "./money";

const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };

/** A tx dated in a previous calendar month (always before the current month). */
function prevMonthTx(partial: Omit<MoneyTx, "date">): MoneyTx {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1); // last day of previous month
  return { ...partial, date: d };
}

/** A tx dated now (always inside the current calendar month). */
function thisMonthTx(partial: Omit<MoneyTx, "date">): MoneyTx {
  return { ...partial, date: new Date() };
}

const inc = (amount: number, currency = "NGN"): Omit<MoneyTx, "date"> => ({
  type: "i",
  amount,
  currency,
});
const exp = (amount: number, currency = "NGN"): Omit<MoneyTx, "date"> => ({
  type: "e",
  amount,
  currency,
});

describe("transactionTotals (dashboard TOTAL scope)", () => {
  it("Case A — historical data, empty current month → TOTAL shows history, THIS MONTH shows zeros", () => {
    const txs: MoneyTx[] = [
      prevMonthTx(inc(200_000)),
      prevMonthTx(inc(200_000)),
      prevMonthTx(exp(120_000)),
      prevMonthTx(exp(80_000)),
    ];
    const total = transactionTotals(txs, "NGN", fx);
    assert.deepEqual(total, { income: 400_000, expenses: 200_000, net: 200_000 });

    const month = transactionTotals(filterMonthTxs(txs), "NGN", fx);
    assert.deepEqual(month, { income: 0, expenses: 0, net: 0 });
  });

  it("Case B — historical data plus current-month activity", () => {
    const txs: MoneyTx[] = [
      prevMonthTx(inc(200_000)),
      prevMonthTx(inc(200_000)),
      prevMonthTx(exp(120_000)),
      prevMonthTx(exp(80_000)),
      thisMonthTx(inc(100_000)),
      thisMonthTx(exp(40_000)),
    ];
    const total = transactionTotals(txs, "NGN", fx);
    assert.deepEqual(total, { income: 500_000, expenses: 240_000, net: 260_000 });

    const month = transactionTotals(filterMonthTxs(txs), "NGN", fx);
    assert.deepEqual(month, { income: 100_000, expenses: 40_000, net: 60_000 });
  });

  it("Case C — brand-new user with no transactions shows zeros", () => {
    const total = transactionTotals([], "NGN", fx);
    assert.deepEqual(total, { income: 0, expenses: 0, net: 0 });
  });

  it("converts foreign-currency transactions to the base currency using fx", () => {
    const txs: MoneyTx[] = [
      prevMonthTx(inc(100, "USD")), // 100 * 1580 = 158_000 NGN
      prevMonthTx(exp(50, "USD")), // 50 * 1580 = 79_000 NGN
      thisMonthTx(inc(10, "GBP")), // 10 * 1990 = 19_900 NGN
    ];
    const total = transactionTotals(txs, "NGN", fx);
    assert.deepEqual(total, { income: 177_900, expenses: 79_000, net: 98_900 });
  });
});
