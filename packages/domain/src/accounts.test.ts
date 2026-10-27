import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accountBalances,
  checkTransfer,
  isValidAmount,
  kindOfType,
  openingError,
  openingToLedger,
  toMinor,
  type LedgerAccount,
} from "./accounts";

const OPEN = new Date("2026-09-01T12:00:00Z");
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 12)); // October

const bank: LedgerAccount = { id: "bank", kind: "asset", currency: "NGN", openingBalanceMinor: toMinor(100_000), openingDate: OPEN };
const cash: LedgerAccount = { id: "cash", kind: "asset", currency: "NGN", openingBalanceMinor: 0, openingDate: OPEN };
const card: LedgerAccount = { id: "card", kind: "liability", currency: "NGN", openingBalanceMinor: openingToLedger("liability", toMinor(20_000)), openingDate: OPEN };
const loan: LedgerAccount = { id: "loan", kind: "liability", currency: "NGN", openingBalanceMinor: 0, openingDate: OPEN };
const usd: LedgerAccount = { id: "usd", kind: "asset", currency: "USD", openingBalanceMinor: 0, openingDate: OPEN };

const balance = (rows: ReturnType<typeof accountBalances>, id: string) =>
  rows.find((r) => r.accountId === id)!;

describe("account balances are derived from opening balance + events", () => {
  it("income adds, expenses subtract", () => {
    const rows = accountBalances([bank], [
      { accountId: "bank", type: "i", amount: 50_000, currency: "NGN", date: day(2) },
      { accountId: "bank", type: "e", amount: 12_500.5, currency: "NGN", date: day(3) },
    ]);
    assert.equal(balance(rows, "bank").balanceMinor, toMinor(100_000 + 50_000 - 12_500.5));
  });

  it("ignores transactions with no account, someone else's account, or before the opening date", () => {
    const rows = accountBalances([bank], [
      { accountId: null, type: "i", amount: 999, currency: "NGN", date: day(2) },
      { accountId: "elsewhere", type: "i", amount: 999, currency: "NGN", date: day(2) },
      { accountId: "bank", type: "i", amount: 999, currency: "NGN", date: new Date("2026-08-31T12:00:00Z") },
    ]);
    assert.equal(balance(rows, "bank").balanceMinor, toMinor(100_000));
    assert.equal(balance(rows, "bank").eventCount, 0);
  });

  it("ignores a transaction whose currency differs from its account's", () => {
    const rows = accountBalances([bank], [{ accountId: "bank", type: "i", amount: 10, currency: "USD", date: day(2) }]);
    assert.equal(balance(rows, "bank").balanceMinor, toMinor(100_000));
  });

  it("counts cents exactly, with no floating-point drift", () => {
    const txs = Array.from({ length: 10 }, () => ({ accountId: "cash", type: "i" as const, amount: 0.1, currency: "NGN", date: day(2) }));
    assert.equal(balance(accountBalances([cash], txs), "cash").balanceMinor, 100); // exactly ₦1.00
  });
});

describe("transfers move money without being income or spending", () => {
  const transfer = (from: string, to: string, amount: number, extra: Partial<{ toAmountMinor: number; feeMinor: number }> = {}) => ({
    fromAccountId: from,
    toAccountId: to,
    fromAmountMinor: toMinor(amount),
    toAmountMinor: extra.toAmountMinor ?? toMinor(amount),
    feeMinor: extra.feeMinor ?? 0,
    date: day(5),
  });

  it("debits one account and credits the other by the same amount; total held is unchanged", () => {
    const rows = accountBalances([bank, cash], [], [transfer("bank", "cash", 30_000)]);
    assert.equal(balance(rows, "bank").balanceMinor, toMinor(70_000));
    assert.equal(balance(rows, "cash").balanceMinor, toMinor(30_000));
    assert.equal(balance(rows, "bank").balanceMinor + balance(rows, "cash").balanceMinor, toMinor(100_000));
    // and it left no income or expense behind
    assert.equal(balance(rows, "bank").incomeMinor + balance(rows, "bank").expenseMinor, 0);
  });

  it("a fee comes out of the source account on top of the amount sent", () => {
    const rows = accountBalances([bank, cash], [], [transfer("bank", "cash", 30_000, { feeMinor: toMinor(50) })]);
    assert.equal(balance(rows, "bank").balanceMinor, toMinor(100_000 - 30_000 - 50));
    assert.equal(balance(rows, "cash").balanceMinor, toMinor(30_000));
    assert.equal(balance(rows, "bank").feesMinor, toMinor(50));
  });

  it("a cross-currency transfer uses the stated amounts on each side", () => {
    // ₦158,000 sent, $98.50 arrived: nothing is assumed
    const rows = accountBalances([bank, usd], [], [transfer("bank", "usd", 158_000, { toAmountMinor: toMinor(98.5) })]);
    assert.equal(balance(rows, "bank").balanceMinor, toMinor(100_000 - 158_000));
    assert.equal(balance(rows, "usd").balanceMinor, toMinor(98.5));
  });

  it("a transfer dated before an account opened does not touch that account", () => {
    const early = { ...transfer("bank", "cash", 10_000), date: new Date("2026-08-01T12:00:00Z") };
    const rows = accountBalances([bank, cash], [], [early]);
    assert.equal(balance(rows, "bank").balanceMinor, toMinor(100_000));
    assert.equal(balance(rows, "cash").balanceMinor, 0);
  });
});

describe("credit cards and loans", () => {
  it("a card opened owing ₦20,000 reports ₦20,000 owed", () => {
    const rows = accountBalances([card], []);
    assert.equal(balance(rows, "card").balanceMinor, -toMinor(20_000));
    assert.equal(balance(rows, "card").owedMinor, toMinor(20_000));
  });

  it("a card purchase is one expense and raises what is owed", () => {
    const rows = accountBalances([card], [{ accountId: "card", type: "e", amount: 5_000, currency: "NGN", date: day(2) }]);
    assert.equal(balance(rows, "card").owedMinor, toMinor(25_000));
  });

  it("paying the card is a transfer: the bank falls, the debt falls, and no second expense exists", () => {
    const txs = [{ accountId: "card", type: "e" as const, amount: 5_000, currency: "NGN", date: day(2) }];
    const pay = [{ fromAccountId: "bank", toAccountId: "card", fromAmountMinor: toMinor(25_000), toAmountMinor: toMinor(25_000), feeMinor: 0, date: day(6) }];
    const rows = accountBalances([bank, card], txs, pay);
    assert.equal(balance(rows, "card").owedMinor, 0);
    assert.equal(balance(rows, "bank").balanceMinor, toMinor(75_000));
    // The spending was counted once, on the card, when it happened
    const spent = rows.reduce((sum, r) => sum + r.expenseMinor, 0);
    assert.equal(spent, toMinor(5_000));
  });

  it("loan proceeds raise the debt and the bank balance, and are not income", () => {
    const draw = [{ fromAccountId: "loan", toAccountId: "bank", fromAmountMinor: toMinor(200_000), toAmountMinor: toMinor(200_000), feeMinor: 0, date: day(3) }];
    const rows = accountBalances([bank, loan], [], draw);
    assert.equal(balance(rows, "loan").owedMinor, toMinor(200_000));
    assert.equal(balance(rows, "bank").balanceMinor, toMinor(300_000));
    assert.equal(rows.reduce((sum, r) => sum + r.incomeMinor, 0), 0);
  });

  it("principal repaid is a transfer; interest is a separate ordinary expense", () => {
    const draw = { fromAccountId: "loan", toAccountId: "bank", fromAmountMinor: toMinor(200_000), toAmountMinor: toMinor(200_000), feeMinor: 0, date: day(3) };
    const principal = { fromAccountId: "bank", toAccountId: "loan", fromAmountMinor: toMinor(50_000), toAmountMinor: toMinor(50_000), feeMinor: 0, date: day(20) };
    const interest = { accountId: "bank", type: "e" as const, amount: 4_000, currency: "NGN", date: day(20) };
    const rows = accountBalances([bank, loan], [interest], [draw, principal]);
    assert.equal(balance(rows, "loan").owedMinor, toMinor(150_000));
    assert.equal(rows.reduce((sum, r) => sum + r.expenseMinor, 0), toMinor(4_000)); // interest only
  });
});

describe("adjustments", () => {
  it("correct a balance without being income or spending", () => {
    const rows = accountBalances([bank], [], [], [{ accountId: "bank", amountMinor: -toMinor(1_250), date: day(9) }]);
    assert.equal(balance(rows, "bank").balanceMinor, toMinor(98_750));
    assert.equal(balance(rows, "bank").incomeMinor + balance(rows, "bank").expenseMinor, 0);
    assert.equal(balance(rows, "bank").adjustmentsMinor, -toMinor(1_250));
  });
});

describe("checkTransfer", () => {
  const base = { fromAccountId: "a", toAccountId: "b", fromCurrency: "NGN", toCurrency: "NGN", fromAmount: 1000 };

  it("accepts a same-currency transfer", () => {
    assert.deepEqual(checkTransfer(base), { ok: true, fromAmountMinor: 100000, toAmountMinor: 100000, feeMinor: 0 });
  });
  it("refuses the same account on both sides", () => {
    assert.equal(checkTransfer({ ...base, toAccountId: "a" }).ok, false);
  });
  it("refuses zero, negative and sub-kobo amounts", () => {
    for (const amount of [0, -5, 1.005, NaN, Infinity]) assert.equal(checkTransfer({ ...base, fromAmount: amount }).ok, false);
  });
  it("same currency: a different received amount is refused (a fee is separate)", () => {
    assert.equal(checkTransfer({ ...base, toAmount: 990 }).ok, false);
    assert.equal(checkTransfer({ ...base, toAmount: 1000, fee: 10 }).ok, true);
  });
  it("different currencies: the received amount must be given, never assumed", () => {
    const usd = { ...base, toCurrency: "USD" };
    const missing = checkTransfer(usd);
    assert.equal(missing.ok, false);
    assert.match((missing as { error: string }).error, /different currencies/);
    assert.deepEqual(checkTransfer({ ...usd, toAmount: 0.63, exchangeRate: 0.00063 }), {
      ok: true, fromAmountMinor: 100000, toAmountMinor: 63, feeMinor: 0,
    });
  });
  it("refuses a negative fee", () => {
    assert.equal(checkTransfer({ ...base, fee: -1 }).ok, false);
  });
});

describe("small helpers", () => {
  it("maps account types to a kind", () => {
    assert.equal(kindOfType("credit_card"), "liability");
    assert.equal(kindOfType("bank"), "asset");
    assert.equal(kindOfType("nope"), null);
  });
  it("a debt's opening amount is typed positive and stored negative", () => {
    assert.equal(openingToLedger("liability", 5000), -5000);
    assert.equal(openingError("liability", -10) !== null, true);
    assert.equal(openingError("asset", -10), null);
  });
  it("isValidAmount", () => {
    assert.equal(isValidAmount(10.25), true);
    assert.equal(isValidAmount(10.255), false);
  });
});
