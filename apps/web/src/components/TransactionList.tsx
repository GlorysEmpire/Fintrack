"use client";

/**
 * A list of transactions that shows where each one is in its lifecycle:
 *
 *   Editable  → "Edit" and "Delete", with how long is left
 *   Locked    → a lock, and (on tap) why it can no longer be changed
 *
 * The lock shown here is a courtesy: the server works it out again from the
 * time the transaction was recorded and refuses edits to a locked one.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Trash2 } from "lucide-react";
import {
  LOCKED_EXPLANATION,
  TRANSACTION_EDIT_WINDOW_HOURS,
  categoryLabel,
  editWindowRemainingLabel,
  formatMoney,
  transactionLockState,
  type BudgetPlan,
  type CurrencyCode,
} from "@fintrack/domain";
import { formatTxDate, toDateInputValue } from "@/lib/format-date";
import type { TxRow } from "@/lib/tx-row";
import { ConfirmDialog } from "./ConfirmDialog";
import { LogTransactionModal } from "./LogTransactionModal";
import { Money } from "./Money";
import { toast } from "@/components/ui/toast";

type Source = {
  id: string;
  name: string;
  emoji: string;
  currency: string;
};

export function TransactionList({
  rows,
  plan,
  sources,
  baseCurrency,
  fx,
  bucketRemaining,
  monthIncome,
  serverNow,
}: {
  rows: TxRow[];
  plan: BudgetPlan | null;
  sources: Source[];
  baseCurrency: string;
  fx: Record<string, number>;
  bucketRemaining?: Record<string, number>;
  monthIncome?: number;
  /** The server's clock when the page was rendered, so the first paint matches */
  serverNow: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(serverNow));
  const [editing, setEditing] = useState<TxRow | null>(null);
  const [deleting, setDeleting] = useState<TxRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** Which locked row is showing its explanation */
  const [lockInfo, setLockInfo] = useState<string | null>(null);

  // Keep the lock states honest while the page stays open
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const bucketOf = (id: string | null) =>
    id && plan ? plan.buckets.find((b) => b.id === id) : undefined;

  const label = (t: TxRow) => {
    if (t.type === "i") {
      const s = sources.find((x) => x.id === t.sourceId);
      return s ? `${s.emoji} ${s.name}` : "💵 Income";
    }
    const b = bucketOf(t.bucketId);
    if (b) return `${b.emoji} ${b.name}`;
    return t.bucketId || "Expense";
  };

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/transactions/${deleting.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not delete");
      setDeleting(null);
      toast("Transaction deleted");
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      {rows.map((t) => {
        const lock = transactionLockState(t.createdAt, now);
        const bucket = bucketOf(t.bucketId);
        const filedEarlier =
          toDateInputValue(t.date) !== toDateInputValue(t.createdAt);
        return (
          <div className="tx-row" key={t.id} data-locked={lock.locked}>
            <div className="tx-item">
              <div className="tx-main">
                <div className="tx-name">
                  {label(t)}
                  {t.type === "e" && t.category ? (
                    <span className="tx-note"> · {categoryLabel(t.category)}</span>
                  ) : null}
                  {t.note ? <span className="tx-note"> · {t.note}</span> : null}
                  {t.override && (
                    <span className="pill pill-y tx-pill" title="Spent on a category that does not match this bucket.">
                      cross-bucket
                    </span>
                  )}
                  {bucket?.archived && (
                    <span className="pill tx-pill tx-pill-muted">archived bucket</span>
                  )}
                </div>
                <div className="tx-meta">
                  {formatTxDate(t.date)}
                  {filedEarlier ? ` · recorded ${formatTxDate(t.createdAt)}` : ""}
                  {t.reason && t.reason !== t.note ? ` · “${t.reason}”` : ""}
                </div>
                <div className="tx-life">
                  {lock.locked ? (
                    <button
                      type="button"
                      className="tx-lock"
                      aria-expanded={lockInfo === t.id}
                      onClick={() => setLockInfo(lockInfo === t.id ? null : t.id)}
                    >
                      <Lock className="h-3 w-3" aria-hidden />
                      Locked · why?
                    </button>
                  ) : (
                    <span className="tx-open">
                      You can edit or delete this for{" "}
                      {editWindowRemainingLabel(lock.msRemaining)} more
                    </span>
                  )}
                </div>
              </div>

              <div className="tx-side">
                <div className={t.type === "i" ? "amt-pos" : "amt-neg"}>
                  <Money
                    amount={t.type === "i" ? t.amount : -t.amount}
                    currency={t.currency}
                    signed
                  />
                </div>
                {!lock.locked && (
                  <div className="tx-actions">
                    <button
                      type="button"
                      className="tx-act"
                      aria-label={`Edit ${label(t)}`}
                      onClick={() => setEditing(t)}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="tx-act tx-act-del"
                      aria-label={`Delete ${label(t)}`}
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(t);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>

            {lock.locked && lockInfo === t.id && (
              <div className="tx-lock-note" role="note">
                {LOCKED_EXPLANATION} You recorded this one on{" "}
                {formatTxDate(t.createdAt)}.
              </div>
            )}
          </div>
        );
      })}

      <LogTransactionModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        plan={plan}
        sources={sources}
        baseCurrency={baseCurrency}
        fx={fx}
        bucketRemaining={bucketRemaining}
        monthIncome={monthIncome}
        editing={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this transaction?"
        confirmLabel="Yes, delete it"
        busyLabel="Deleting…"
        cancelLabel="Keep it"
        danger
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
      >
        {deleting && (
          <>
            <p>
              <strong>{label(deleting)}</strong>
              {deleting.note ? ` · ${deleting.note}` : ""} ·{" "}
              {formatMoney(deleting.amount, deleting.currency as CurrencyCode)} ·{" "}
              {formatTxDate(deleting.date)}
            </p>
            <p>
              It is removed from your history and your bucket balances are
              recalculated without it. This can not be undone.
            </p>
            <p className="muted">
              Use this for a mistaken entry. Deleting is only possible in the
              first {TRANSACTION_EDIT_WINDOW_HOURS} hours after recording.
            </p>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
