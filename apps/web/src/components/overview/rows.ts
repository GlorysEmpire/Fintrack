import { transactionLockState } from "@fintrack/domain";
import type { TxRow } from "@/lib/tx-row";

/**
 * Rows for a short list: every transaction that can still be edited is always
 * shown (so it can be found and corrected while its window is open), then the
 * most recent locked ones up to `limit`. Order is unchanged (newest first).
 */
export function rowsToShow(all: TxRow[], limit: number, serverNow: string): TxRow[] {
  const at = new Date(serverNow);
  const editable = all.filter((t) => !transactionLockState(t.createdAt, at).locked);
  const keep = new Set(editable.map((t) => t.id));
  for (const t of all) {
    if (keep.size >= Math.max(limit, editable.length)) break;
    keep.add(t.id);
  }
  return all.filter((t) => keep.has(t.id));
}
