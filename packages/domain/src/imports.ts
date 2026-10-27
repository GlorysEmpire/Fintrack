/**
 * BANK IMPORTS — rules for transactions that arrive from a bank, read-only.
 *
 * An import is a CLAIM from a provider about what happened at a bank. It is not
 * yet a FinTrack transaction: a person reviews it first, and only then does it
 * become one (or is matched to one they already entered, or is ignored). So an
 * import can never silently create income or spending, and the same provider
 * transaction can never create two.
 *
 * Pure rules only: no database, no provider code, no React. Provider-specific
 * details stay behind the adapter in the web app; the domain sees only these shapes.
 */

export type ImportStatus = "pending" | "posted" | "reversed";
export type ImportReview = "new" | "accepted" | "matched" | "ignored";

/** What a provider says about one transaction (amounts in minor units, signed: money in is positive) */
export interface ProviderTransactionShape {
  externalId: string;
  status: ImportStatus;
  amountMinor: number;
  currency: string;
}

/** What is stored about an import, for deciding how a later update from the provider applies */
export interface StoredImport {
  status: ImportStatus;
  amountMinor: number;
  review: ImportReview;
}

export type ImportUpdate =
  /** The provider says nothing new */
  | { kind: "unchanged" }
  /** Safe to overwrite: nobody has acted on this import yet */
  | { kind: "update"; status: ImportStatus; amountMinor: number }
  /**
   * The import was already accepted or matched, and the provider has since
   * changed it. Never rewrite the FinTrack transaction (invariant: history is
   * not altered silently); flag it for the person instead.
   */
  | { kind: "attention"; status: ImportStatus; amountMinor: number; reason: string };

/**
 * How a later provider update applies to something already stored.
 *
 *  - A pending import may become posted (and its amount may settle): update it.
 *  - A posted import never goes back to pending: a stale or out-of-order
 *    update must not undo it.
 *  - A reversed import stays reversed.
 *  - If a person already acted on it, a change is flagged, never applied.
 */
export function applyProviderUpdate(
  stored: StoredImport,
  incoming: ProviderTransactionShape
): ImportUpdate {
  const acted = stored.review === "accepted" || stored.review === "matched";

  let status = incoming.status;
  if (stored.status === "reversed") status = "reversed";
  else if (stored.status === "posted" && incoming.status === "pending") status = "posted";

  // A posted amount is final: an out-of-order pending update must not change it
  const amountMinor =
    stored.status === "posted" && incoming.status === "pending"
      ? stored.amountMinor
      : incoming.amountMinor;

  if (status === stored.status && amountMinor === stored.amountMinor) return { kind: "unchanged" };

  if (acted) {
    const reason =
      status === "reversed" && stored.status !== "reversed"
        ? "The bank reversed this transaction after you recorded it."
        : amountMinor !== stored.amountMinor
          ? "The bank changed the amount after you recorded it."
          : "The bank changed this transaction after you recorded it.";
    return { kind: "attention", status, amountMinor, reason };
  }
  return { kind: "update", status, amountMinor };
}

/* ─── Matching with transactions the user already entered ─────────── */

/** How many days apart a manual entry and a bank record may be and still look like the same thing */
export const MATCH_WINDOW_DAYS = 3;

export interface MatchableImport {
  accountId: string;
  currency: string;
  amountMinor: number;
  /** Day the bank says it happened, "YYYY-MM-DD" */
  dayKey: string;
}

export interface MatchCandidate {
  id: string;
  accountId: string | null;
  type: "i" | "e";
  /** Major units, as stored on the transaction */
  amount: number;
  currency: string;
  /** "YYYY-MM-DD" */
  dayKey: string;
  /** Already tied to another import */
  linked: boolean;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export interface MatchSuggestion {
  transactionId: string;
  daysApart: number;
}

/**
 * Manual transactions that look like the same real-world event as an import:
 * same account, currency, direction and exact amount, within a few days, and
 * not already claimed by another import. Closest date first. Only a SUGGESTION:
 * nothing is merged until the person confirms it.
 */
export function suggestMatches(
  imported: MatchableImport,
  candidates: MatchCandidate[]
): MatchSuggestion[] {
  const type: "i" | "e" = imported.amountMinor >= 0 ? "i" : "e";
  const wantMinor = Math.abs(imported.amountMinor);
  return candidates
    .filter(
      (c) =>
        !c.linked &&
        c.accountId === imported.accountId &&
        c.currency === imported.currency &&
        c.type === type &&
        Math.round(c.amount * 100) === wantMinor
    )
    .map((c) => ({
      transactionId: c.id,
      daysApart: Math.abs(dayNumber(c.dayKey) - dayNumber(imported.dayKey)),
    }))
    .filter((m) => m.daysApart <= MATCH_WINDOW_DAYS)
    .sort((a, b) => a.daysApart - b.daysApart || a.transactionId.localeCompare(b.transactionId));
}

/* ─── Retrying a failing connection ───────────────────────────────── */

/** After this many failures in a row the connection stops retrying and needs the person */
export const MAX_CONSECUTIVE_FAILURES = 8;

const BASE_BACKOFF_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

/** How long to wait before the next try after `failures` failures in a row: 5 min, doubling, up to 6 hours */
export function retryDelayMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (failures - 1));
}
