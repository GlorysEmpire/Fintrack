import type { BudgetPlan, LoggingStreak } from "@fintrack/domain";
import type { TxRow } from "@/lib/tx-row";

export type LogSource = { id: string; name: string; emoji: string; currency: string };

export type Shortfall = {
  bucketName: string;
  /** Base currency */
  short: number;
  options: { bucketId: string; name: string; available: number; protected: boolean }[];
};

export type AccountOption = {
  id: string;
  name: string;
  currency: string;
  /** Debts (cards, loans) are marked so the user knows spending raises what is owed */
  kind: string;
};

export type LogFormProps = {
  open: boolean;
  onClose: () => void;
  plan: BudgetPlan | null;
  sources: LogSource[];
  /** The user's active accounts; omit if there are none */
  accounts?: AccountOption[];
  baseCurrency: string;
  fx: Record<string, number>;
  /** Optional live remaining by bucket id (base currency, this month) for warnings */
  bucketRemaining?: Record<string, number>;
  /** Income already logged this month (base currency), for the split preview */
  monthIncome?: number;
  /** Set to edit this transaction instead of logging a new one */
  editing?: TxRow | null;
  /** Days in a row something was recorded, before this one */
  streak?: LoggingStreak;
};
