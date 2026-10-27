/**
 * Pulling a connection's transactions into the review queue.
 *
 * What this guarantees:
 *  - READ-ONLY. It writes ImportedTransaction rows (claims awaiting review) and
 *    the connection's own sync state. It never creates a FinTrack transaction,
 *    so a sync can never silently create income or spending.
 *  - Idempotent. (connectionId, externalId) is unique, so running it twice, or
 *    two syncs at once, can never import the same provider transaction twice.
 *  - Resumable. The cursor moves forward only after a page is saved, so a
 *    failure part-way re-reads that page (harmlessly) instead of skipping it.
 *  - Corrections are handled, not applied blindly: a pending import may settle
 *    or be reversed; once a person has acted on one, a later change by the bank
 *    is flagged for them and the transaction they recorded is left alone.
 *  - Failures are per connection, with backoff. A bad connection never stops
 *    another, and after repeated failures it stops retrying and asks the person.
 *  - Nothing sensitive is logged or stored as an error: a plain sentence only.
 */
import {
  MAX_CONSECUTIVE_FAILURES,
  applyProviderUpdate,
  retryDelayMs,
} from "@fintrack/domain";
import type { BankConnection } from "@prisma/client";
import { prisma } from "../db";
import { ProviderError, type ProviderTransaction } from "./provider";
import { getProvider } from "./registry";

const CURRENCIES = new Set(["NGN", "USD", "GBP", "EUR"]);
const MAX_PAGES_PER_SYNC = 20;

export type SyncResult = {
  connectionId: string;
  outcome: "synced" | "skipped" | "failed";
  /** Why it was skipped or failed, as a plain sentence */
  reason?: string;
  created: number;
  updated: number;
  flagged: number;
  unchanged: number;
  /** Provider transactions for an account the person has not linked, or malformed ones */
  ignored: number;
};

const empty = (connectionId: string): SyncResult => ({
  connectionId,
  outcome: "synced",
  created: 0,
  updated: 0,
  flagged: 0,
  unchanged: 0,
  ignored: 0,
});

function wellFormed(t: ProviderTransaction): boolean {
  return (
    typeof t.externalId === "string" &&
    t.externalId.length > 0 &&
    t.externalId.length <= 200 &&
    Number.isSafeInteger(t.amountMinor) &&
    t.amountMinor !== 0 &&
    CURRENCIES.has(t.currency) &&
    t.occurredAt instanceof Date &&
    !Number.isNaN(t.occurredAt.getTime()) &&
    ["pending", "posted", "reversed"].includes(t.status)
  );
}

type Counts = Pick<SyncResult, "created" | "updated" | "flagged" | "unchanged" | "ignored">;

async function saveOne(
  connection: BankConnection,
  accountIds: Map<string, string>,
  t: ProviderTransaction,
  counts: Counts
): Promise<void> {
  const accountId = accountIds.get(t.externalAccountId);
  if (!accountId || !wellFormed(t)) {
    counts.ignored += 1;
    return;
  }

  const existing = await prisma.importedTransaction.findFirst({
    where: { connectionId: connection.id, externalId: t.externalId },
  });

  if (!existing) {
    try {
      await prisma.importedTransaction.create({
        data: {
          userId: connection.userId,
          connectionId: connection.id,
          accountId,
          externalId: t.externalId,
          status: t.status,
          amountMinor: BigInt(t.amountMinor),
          currency: t.currency,
          originalAmountMinor:
            t.originalAmountMinor !== undefined ? BigInt(t.originalAmountMinor) : null,
          originalCurrency: t.originalCurrency ?? null,
          occurredAt: t.occurredAt,
          description: t.description?.slice(0, 300) ?? null,
          counterparty: t.counterparty?.slice(0, 200) ?? null,
        },
      });
      counts.created += 1;
      return;
    } catch (e) {
      // A concurrent sync saved it first: carry on as an update of that row
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }

  const row =
    existing ??
    (await prisma.importedTransaction.findFirst({
      where: { connectionId: connection.id, externalId: t.externalId },
    }));
  if (!row) throw new Error("Imported transaction disappeared during sync");

  const decision = applyProviderUpdate(
    {
      status: row.status as "pending" | "posted" | "reversed",
      amountMinor: Number(row.amountMinor),
      review: row.review as "new" | "accepted" | "matched" | "ignored",
    },
    { externalId: t.externalId, status: t.status, amountMinor: t.amountMinor, currency: t.currency }
  );

  if (decision.kind === "unchanged") {
    counts.unchanged += 1;
  } else if (decision.kind === "update") {
    await prisma.importedTransaction.update({
      where: { id: row.id },
      data: { status: decision.status, amountMinor: BigInt(decision.amountMinor) },
    });
    counts.updated += 1;
  } else {
    // Already recorded by the person: flag it, never rewrite what they recorded
    await prisma.importedTransaction.update({
      where: { id: row.id },
      data: {
        status: decision.status,
        amountMinor: BigInt(decision.amountMinor),
        attention: decision.reason,
      },
    });
    counts.flagged += 1;
  }
}

/** Sync one connection. Never throws: the outcome says what happened. */
export async function syncConnection(
  connectionId: string,
  now: Date = new Date()
): Promise<SyncResult> {
  const result = empty(connectionId);
  const connection = await prisma.bankConnection.findFirst({ where: { id: connectionId } });
  if (!connection) return { ...result, outcome: "skipped", reason: "No such connection." };
  if (connection.status !== "active") {
    return { ...result, outcome: "skipped", reason: `The connection is ${connection.status}.` };
  }
  if (connection.nextRetryAt && connection.nextRetryAt.getTime() > now.getTime()) {
    return { ...result, outcome: "skipped", reason: "Waiting before the next retry." };
  }

  const provider = getProvider(connection.provider);
  if (!provider) {
    return { ...result, outcome: "skipped", reason: "This provider is not available." };
  }

  const linked = await prisma.account.findMany({
    where: { connectionId: connection.id, userId: connection.userId },
    select: { id: true, externalAccountId: true },
  });
  const accountIds = new Map<string, string>();
  for (const a of linked) if (a.externalAccountId) accountIds.set(a.externalAccountId, a.id);

  const ref = { id: connection.id, userId: connection.userId };
  let cursor = connection.cursor;
  try {
    for (let page = 0; page < MAX_PAGES_PER_SYNC; page++) {
      const batch = await provider.fetchTransactions(ref, cursor);
      for (const t of batch.transactions) await saveOne(connection, accountIds, t, result);
      // Only now that the page is saved may the cursor move
      if (batch.nextCursor !== null && batch.nextCursor !== cursor) {
        cursor = batch.nextCursor;
        await prisma.bankConnection.update({ where: { id: connection.id }, data: { cursor } });
      }
      if (!batch.hasMore) break;
    }
    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: now,
        lastSuccessAt: now,
        consecutiveFailures: 0,
        nextRetryAt: null,
        lastError: null,
      },
    });
    return result;
  } catch (e) {
    const kind = e instanceof ProviderError ? e.kind : "transient";
    const failures = connection.consecutiveFailures + 1;
    const stop = kind === "auth" || failures >= MAX_CONSECUTIVE_FAILURES;
    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: now,
        consecutiveFailures: failures,
        status: kind === "auth" ? "expired" : stop ? "error" : "active",
        nextRetryAt: stop ? null : new Date(now.getTime() + retryDelayMs(failures)),
        lastError:
          kind === "auth"
            ? "The bank no longer allows access. Reconnect to continue."
            : stop
              ? "Syncing kept failing, so it was stopped. Reconnect to try again."
              : "The last sync failed and will be retried.",
      },
    });
    // The kind only: never provider payloads, amounts or descriptions
    console.error(`[bank-sync] connection sync failed: ${kind}`);
    return { ...result, outcome: "failed", reason: kind === "auth" ? "consent" : "temporary" };
  }
}

/** Sync every active connection that is due. Each is independent. */
export async function syncAllDue(now: Date = new Date()): Promise<SyncResult[]> {
  const connections = await prisma.bankConnection.findMany({
    where: { status: "active" },
    orderBy: { lastSyncAt: "asc" },
    take: 100,
  });
  const out: SyncResult[] = [];
  for (const c of connections) out.push(await syncConnection(c.id, now));
  return out;
}
