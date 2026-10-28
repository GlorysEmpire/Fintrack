import type { ComponentProps } from "react";
import { Receipt } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "../EmptyState";
import { TransactionList } from "../TransactionList";
import { useLogSheet } from "../log/LogSheetProvider";
import { rowsToShow } from "./rows";
import type { TxRow } from "@/lib/tx-row";

/** Everything TransactionList needs except the rows themselves */
export type TxListProps = Omit<ComponentProps<typeof TransactionList>, "rows">;

/** This month's latest rows, each with its edit window or lock */
export function RecentTransactions({
  rows,
  listProps,
}: {
  rows: TxRow[];
  listProps: TxListProps;
}) {
  const { open: openLog } = useLogSheet();
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
            onAction={() => openLog()}
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
      <div className="sec flex items-center gap-2">
        History (past months)
        <InfoTip label="About history">
          These logs are kept. A transaction you file under an earlier month appears here.
        </InfoTip>
      </div>
      <div className="card">
        <TransactionList rows={rowsToShow(rows, 20, listProps.serverNow)} {...listProps} />
      </div>
    </>
  );
}
