import type { ComponentProps } from "react";
import { Receipt } from "lucide-react";
import { EmptyState } from "../EmptyState";
import { TransactionList } from "../TransactionList";
import { rowsToShow } from "./rows";
import type { TxRow } from "@/lib/tx-row";

/** Everything TransactionList needs except the rows themselves */
export type TxListProps = Omit<ComponentProps<typeof TransactionList>, "rows">;

/** This month's latest rows, each with its edit window or lock */
export function RecentTransactions({
  rows,
  listProps,
  onLog,
}: {
  rows: TxRow[];
  listProps: TxListProps;
  onLog: () => void;
}) {
  const shown = rowsToShow(rows, 8, listProps.serverNow);
  return (
    <>
      <div className="sec">Recent transactions</div>
      <div className="card">
        {shown.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Log income or an expense to start tracking this month."
            actionLabel="Log transaction"
            onAction={onLog}
          />
        ) : (
          <TransactionList rows={shown} {...listProps} />
        )}
      </div>
    </>
  );
}

export function HistoryTransactions({
  rows,
  listProps,
}: {
  rows: TxRow[];
  listProps: TxListProps;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="sec">History (past months)</div>
      <div className="card">
        <p className="mb-2.5 text-xs text-subtle">
          These logs are kept. A transaction you file under an earlier month appears here.
        </p>
        <TransactionList rows={rowsToShow(rows, 20, listProps.serverNow)} {...listProps} />
      </div>
    </>
  );
}
