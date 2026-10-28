/**
 * The user's own data, handed back to them.
 *
 * Everything is read with the user's id and nothing else: no other user's rows,
 * and none of the secrets that live next to them (password hash, session
 * tokens, login codes). Plain, documented, portable files so the user is never
 * locked in.
 *
 * Money is written exactly: transaction amounts in major units with two
 * decimals, account and transfer amounts converted from integer minor units.
 */
import { APP_TIME_ZONE, dateKeyInTimeZone } from "@fintrack/domain";
import { prisma } from "./db";
import { majorToDecimal, minorToDecimal, toCsv, type CsvCell } from "./csv";
import { parsePlan } from "./plan";

export const EXPORT_SCHEMA_VERSION = 1;

export type ExportBundle = Awaited<ReturnType<typeof buildExport>>;

const day = (d: Date) => dateKeyInTimeZone(d, APP_TIME_ZONE);
const money = (minor: bigint | number) => minorToDecimal(Number(minor));

export async function buildExport(userId: string, now: Date = new Date()) {
  const [user, planRow, accounts, transactions, transfers, adjustments, sources, rules, connections, imports, reallocations] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.budgetPlan.findUnique({ where: { userId } }),
      prisma.account.findMany({ where: { userId }, orderBy: { name: "asc" } }),
      prisma.transaction.findMany({ where: { userId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
      prisma.transfer.findMany({ where: { userId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
      prisma.accountAdjustment.findMany({ where: { userId }, orderBy: { date: "asc" } }),
      prisma.incomeSource.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.recurringRule.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.bankConnection.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.importedTransaction.findMany({ where: { userId }, orderBy: { occurredAt: "asc" } }),
      prisma.reallocation.findMany({ where: { userId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    ]);
  if (!user) throw new Error("No such user");

  const plan = planRow ? parsePlan(planRow) : null;
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const bucketName = new Map((plan?.buckets ?? []).map((b) => [b.id, b.name]));
  const sourceName = new Map(sources.map((s) => [s.id, s.name]));

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    baseCurrency: user.baseCurrency,
    notes: [
      "Dates are calendar days in Africa/Lagos (YYYY-MM-DD).",
      "Transaction amounts are decimals in the transaction's own currency.",
      "Account balances are not stored: they are derived from the opening balance and the movements.",
      "A transfer fee is recorded as an ordinary expense linked to its transfer (transferId).",
    ],
    plan: plan && { name: plan.name, buckets: plan.buckets },
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      type: a.type,
      institution: a.institution,
      currency: a.currency,
      status: a.status,
      openingBalance: money(a.openingBalanceMinor),
      openingDate: day(a.openingDate),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      date: day(t.date),
      recordedAt: t.createdAt.toISOString(),
      type: t.type === "i" ? "income" : "expense",
      amount: majorToDecimal(t.amount),
      currency: t.currency,
      bucketId: t.bucketId,
      bucket: t.bucketId ? bucketName.get(t.bucketId) ?? null : null,
      category: t.category,
      incomeSource: t.sourceId ? sourceName.get(t.sourceId) ?? null : null,
      accountId: t.accountId,
      account: t.accountId ? accountName.get(t.accountId) ?? null : null,
      note: t.note,
      reason: t.reason,
      crossBucket: t.override,
      recurringRuleId: t.recurringRuleId,
      transferId: t.transferId,
      bankImportId: t.importId,
    })),
    transfers: transfers.map((t) => ({
      id: t.id,
      date: day(t.date),
      recordedAt: t.createdAt.toISOString(),
      fromAccountId: t.fromAccountId,
      fromAccount: accountName.get(t.fromAccountId) ?? null,
      toAccountId: t.toAccountId,
      toAccount: accountName.get(t.toAccountId) ?? null,
      amountSent: money(t.fromAmountMinor),
      amountReceived: money(t.toAmountMinor),
      fee: money(t.feeMinor),
      exchangeRate: t.exchangeRate,
      note: t.note,
      reference: t.reference,
    })),
    adjustments: adjustments.map((a) => ({
      id: a.id,
      date: day(a.date),
      accountId: a.accountId,
      account: accountName.get(a.accountId) ?? null,
      amount: money(a.amountMinor),
      note: a.note,
    })),
    incomeSources: sources.map((s) => ({ id: s.id, name: s.name, type: s.type, currency: s.currency, expectedAmount: majorToDecimal(s.amount) })),
    recurringRules: rules.map((r) => ({
      id: r.id,
      type: r.type === "i" ? "income" : "expense",
      amount: majorToDecimal(r.amount),
      currency: r.currency,
      cadence: r.cadence,
      dayOfMonth: r.dayOfMonth,
      nextDate: day(r.nextRunAt),
      active: r.active,
      bucketId: r.bucketId,
      accountId: r.accountId,
      note: r.note,
    })),
    /** Approved exceptions: an expense funded from another bucket, and why */
    reallocations: reallocations.map((r) => ({
      id: r.id,
      date: day(r.date),
      transactionId: r.transactionId,
      fromBucketId: r.fromBucketId,
      fromBucket: bucketName.get(r.fromBucketId) ?? null,
      toBucketId: r.toBucketId,
      toBucket: bucketName.get(r.toBucketId) ?? null,
      amount: money(r.amountMinor),
      currency: r.currency,
      fromProtectedBucket: r.fromProtected,
      reason: r.reason,
    })),
    bankConnections: connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      status: c.status,
      consentGrantedAt: c.consentGrantedAt.toISOString(),
      revokedAt: c.revokedAt?.toISOString() ?? null,
    })),
    bankImports: imports.map((i) => ({
      id: i.id,
      date: day(i.occurredAt),
      accountId: i.accountId,
      status: i.status,
      amount: money(i.amountMinor),
      currency: i.currency,
      description: i.description,
      counterparty: i.counterparty,
      review: i.review,
      recordedAs: i.transactionId,
    })),
  };
}

export type ExportKind = "transactions" | "transfers" | "accounts";

/** One table as CSV */
export function exportCsv(bundle: ExportBundle, kind: ExportKind): string {
  if (kind === "transactions") {
    return toCsv(
      ["date", "recorded_at", "type", "amount", "currency", "account", "bucket", "category", "income_source", "note", "reason", "cross_bucket", "recurring", "transfer_fee_for", "from_bank_import", "id"],
      bundle.transactions.map((t): CsvCell[] => [t.date, t.recordedAt, t.type, t.amount, t.currency, t.account, t.bucket, t.category, t.incomeSource, t.note, t.reason, t.crossBucket, Boolean(t.recurringRuleId), t.transferId, t.bankImportId, t.id])
    );
  }
  if (kind === "transfers") {
    return toCsv(
      ["date", "recorded_at", "from_account", "to_account", "amount_sent", "amount_received", "fee", "exchange_rate", "note", "reference", "id"],
      bundle.transfers.map((t): CsvCell[] => [t.date, t.recordedAt, t.fromAccount, t.toAccount, t.amountSent, t.amountReceived, t.fee, t.exchangeRate, t.note, t.reference, t.id])
    );
  }
  return toCsv(
    ["name", "kind", "type", "institution", "currency", "status", "opening_balance", "opening_date", "id"],
    bundle.accounts.map((a): CsvCell[] => [a.name, a.kind, a.type, a.institution, a.currency, a.status, a.openingBalance, a.openingDate, a.id])
  );
}
