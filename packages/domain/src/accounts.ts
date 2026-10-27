/**
 * FINANCIAL ACCOUNTS — where money is held, or where a debt sits.
 *
 * Three different questions, three different things (never mixed):
 *   Account      where is the money?       (this file)
 *   Plan bucket  what is the money for?    (plan.ts, waterfall.ts)
 *   Transaction  what happened?            (money.ts)
 *
 * ONE SIGN CONVENTION for every account: the balance is "money held", signed.
 *   - An asset account (bank, cash, wallet, savings, investment) holds money
 *     when its balance is above zero.
 *   - A liability account (credit card, loan) is a debt, so its balance is
 *     NEGATIVE: -₦50,000 means ₦50,000 is owed. "Owed" is just the balance
 *     with the sign flipped for display.
 *   Nothing else needs special-casing, because every event is simply money in
 *   or money out of the account:
 *     - credit-card purchase     expense out of the card: owed goes up (spending, once)
 *     - paying the card          transfer bank → card: bank down, owed down (NOT spending)
 *     - loan proceeds            transfer loan → bank: owed up, bank up (NOT income)
 *     - loan principal repaid    transfer bank → loan (NOT an expense)
 *     - loan interest, fees      ordinary expenses
 *
 * A balance is never stored. It is derived: opening balance + every event
 * dated on or after the opening date. So it can not drift from the history.
 *
 * Amounts here are integer MINOR UNITS (kobo, cents): no floating-point drift.
 *
 * Pure rules only: no database, no React.
 */

export type AccountKind = "asset" | "liability";

export const ACCOUNT_TYPES = [
  { id: "bank", label: "Bank account", kind: "asset" },
  { id: "cash", label: "Cash", kind: "asset" },
  { id: "wallet", label: "Mobile wallet", kind: "asset" },
  { id: "savings", label: "Savings", kind: "asset" },
  { id: "investment", label: "Investment", kind: "asset" },
  { id: "credit_card", label: "Credit card", kind: "liability" },
  { id: "loan", label: "Loan", kind: "liability" },
  { id: "other_asset", label: "Other (holds money)", kind: "asset" },
  { id: "other_liability", label: "Other (a debt)", kind: "liability" },
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number]["id"];
export type AccountStatus = "active" | "archived" | "disconnected";

export function kindOfType(type: string): AccountKind | null {
  return ACCOUNT_TYPES.find((t) => t.id === type)?.kind ?? null;
}

/** Whole minor units from a major-unit amount typed by a person (₦1,234.56 → 123456) */
export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

/** An amount of money that can be stored: positive, finite, at most two decimals */
export function isValidAmount(amount: unknown): amount is number {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return false;
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
}

/* ─── Events that move an account ─────────────────────────────────── */

/** An income or expense assigned to an account */
export interface LedgerTx {
  accountId?: string | null;
  type: "i" | "e";
  /** Major units, as stored on the transaction */
  amount: number;
  currency: string;
  date: Date | string;
}

/** Money moved between two of the user's own accounts. Never income or spending. */
export interface LedgerTransfer {
  fromAccountId: string;
  toAccountId: string;
  fromAmountMinor: number;
  toAmountMinor: number;
  /** Extra charge taken from the source account, on top of the amount sent */
  feeMinor: number;
  date: Date | string;
}

/** A correction so the balance matches reality. Not income, not spending. */
export interface LedgerAdjustment {
  accountId: string;
  /** Signed: positive adds to the balance, negative takes away */
  amountMinor: number;
  date: Date | string;
}

export interface LedgerAccount {
  id: string;
  kind: AccountKind;
  currency: string;
  /** Signed, in the convention above (a debt is negative) */
  openingBalanceMinor: number;
  openingDate: Date | string;
}

const time = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).getTime();

export interface AccountBalance {
  accountId: string;
  /** Signed money held (a debt is negative) */
  balanceMinor: number;
  /** For a liability: how much is owed (never negative); 0 for an asset */
  owedMinor: number;
  /** Movement by source, for explaining the number */
  incomeMinor: number;
  expenseMinor: number;
  transfersInMinor: number;
  transfersOutMinor: number;
  feesMinor: number;
  adjustmentsMinor: number;
  /** Events on or after the opening date that were counted */
  eventCount: number;
}

/**
 * Every account's balance, from the opening balance and the events.
 *
 * Only events dated on or after an account's opening date count: the opening
 * balance already includes everything before it. A transaction in a different
 * currency from its account is ignored here (the app refuses to record one).
 */
export function accountBalances(
  accounts: LedgerAccount[],
  txs: LedgerTx[],
  transfers: LedgerTransfer[] = [],
  adjustments: LedgerAdjustment[] = []
): AccountBalance[] {
  const byId = new Map<string, AccountBalance & { opened: number; currency: string; kind: AccountKind; opening: number }>();
  for (const a of accounts) {
    byId.set(a.id, {
      accountId: a.id,
      balanceMinor: 0,
      owedMinor: 0,
      incomeMinor: 0,
      expenseMinor: 0,
      transfersInMinor: 0,
      transfersOutMinor: 0,
      feesMinor: 0,
      adjustmentsMinor: 0,
      eventCount: 0,
      opened: time(a.openingDate),
      currency: a.currency,
      kind: a.kind,
      opening: a.openingBalanceMinor,
    });
  }

  for (const t of txs) {
    const row = t.accountId ? byId.get(t.accountId) : undefined;
    if (!row || t.currency !== row.currency || time(t.date) < row.opened) continue;
    const minor = toMinor(t.amount);
    if (t.type === "i") row.incomeMinor += minor;
    else row.expenseMinor += minor;
    row.eventCount += 1;
  }
  for (const tr of transfers) {
    const from = byId.get(tr.fromAccountId);
    if (from && time(tr.date) >= from.opened) {
      from.transfersOutMinor += tr.fromAmountMinor;
      from.feesMinor += tr.feeMinor;
      from.eventCount += 1;
    }
    const to = byId.get(tr.toAccountId);
    if (to && time(tr.date) >= to.opened) {
      to.transfersInMinor += tr.toAmountMinor;
      to.eventCount += 1;
    }
  }
  for (const adj of adjustments) {
    const row = byId.get(adj.accountId);
    if (!row || time(adj.date) < row.opened) continue;
    row.adjustmentsMinor += adj.amountMinor;
    row.eventCount += 1;
  }

  return [...byId.values()].map((r) => {
    const balanceMinor =
      r.opening +
      r.incomeMinor -
      r.expenseMinor +
      r.transfersInMinor -
      r.transfersOutMinor -
      r.feesMinor +
      r.adjustmentsMinor;
    return {
      accountId: r.accountId,
      balanceMinor,
      owedMinor: r.kind === "liability" ? Math.max(0, -balanceMinor) : 0,
      incomeMinor: r.incomeMinor,
      expenseMinor: r.expenseMinor,
      transfersInMinor: r.transfersInMinor,
      transfersOutMinor: r.transfersOutMinor,
      feesMinor: r.feesMinor,
      adjustmentsMinor: r.adjustmentsMinor,
      eventCount: r.eventCount,
    };
  });
}

/** The opening balance in ledger terms from what a person types: for a debt, the amount OWED. */
export function openingToLedger(kind: AccountKind, typedAmountMinor: number): number {
  return kind === "liability" ? -Math.abs(typedAmountMinor) : typedAmountMinor;
}

/** Back from ledger terms to what a person typed (a debt shows as a positive amount owed). */
export function openingFromLedger(kind: AccountKind, ledgerMinor: number): number {
  return kind === "liability" ? Math.abs(ledgerMinor) : ledgerMinor;
}

/** Whether the opening balance of a liability was typed as a credit (money owed TO the user): refused. */
export function openingError(kind: AccountKind, typedAmount: number): string | null {
  if (!Number.isFinite(typedAmount)) return "Enter a valid opening balance.";
  if (Math.abs(typedAmount * 100 - Math.round(typedAmount * 100)) > 1e-6) {
    return "Use at most two decimal places.";
  }
  if (Math.abs(typedAmount) > 1_000_000_000_000) return "That amount is too large.";
  if (kind === "liability" && typedAmount < 0) {
    return "Enter the amount you owe as a positive number.";
  }
  return null;
}

/* ─── Transfers ───────────────────────────────────────────────────── */

export interface TransferShape {
  fromAccountId: string;
  toAccountId: string;
  fromCurrency: string;
  toCurrency: string;
  /** Major units */
  fromAmount: number;
  /** Major units. Required when the currencies differ; otherwise it must equal fromAmount. */
  toAmount?: number | null;
  fee?: number | null;
  /** Optional, informational: how many destination units per source unit. Never used for arithmetic. */
  exchangeRate?: number | null;
}

export type TransferCheck =
  | { ok: true; fromAmountMinor: number; toAmountMinor: number; feeMinor: number }
  | { ok: false; error: string };

/**
 * Whether a transfer is well formed, and its amounts in minor units.
 *
 * The two sides are stated, never assumed: across currencies the user gives
 * what left and what arrived, and FinTrack does not invent a conversion.
 */
export function checkTransfer(t: TransferShape): TransferCheck {
  if (t.fromAccountId === t.toAccountId) {
    return { ok: false, error: "Pick two different accounts." };
  }
  if (!isValidAmount(t.fromAmount)) {
    return { ok: false, error: "Enter an amount above 0, with at most two decimal places." };
  }
  const feeMinor = t.fee == null || t.fee === 0 ? 0 : t.fee > 0 && isValidAmount(t.fee) ? toMinor(t.fee) : NaN;
  if (Number.isNaN(feeMinor)) {
    return { ok: false, error: "The fee must be 0 or more, with at most two decimal places." };
  }
  const fromAmountMinor = toMinor(t.fromAmount);

  if (t.fromCurrency === t.toCurrency) {
    if (t.toAmount != null && Math.abs(toMinor(t.toAmount) - fromAmountMinor) > 0) {
      return {
        ok: false,
        error: "Both accounts use the same currency, so the amount sent and received must match. Use the fee for any charge.",
      };
    }
    return { ok: true, fromAmountMinor, toAmountMinor: fromAmountMinor, feeMinor };
  }

  if (t.toAmount == null || !isValidAmount(t.toAmount)) {
    return {
      ok: false,
      error: `These accounts use different currencies (${t.fromCurrency} and ${t.toCurrency}). Enter the amount that arrived in ${t.toCurrency}.`,
    };
  }
  if (t.exchangeRate != null && !(Number.isFinite(t.exchangeRate) && t.exchangeRate > 0)) {
    return { ok: false, error: "The exchange rate must be above 0." };
  }
  return { ok: true, fromAmountMinor, toAmountMinor: toMinor(t.toAmount), feeMinor };
}
