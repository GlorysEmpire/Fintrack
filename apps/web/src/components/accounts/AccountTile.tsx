import { Banknote, CreditCard, Landmark, LineChart, PiggyBank, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** How each kind of account looks: its icon and its card colour (all from theme tokens) */
const LOOK: Record<string, { icon: LucideIcon; card: string }> = {
  bank: { icon: Landmark, card: "from-primary/35 to-primary/10" },
  cash: { icon: Banknote, card: "from-primary/25 to-muted" },
  wallet: { icon: Wallet, card: "from-bucket-emergency/30 to-muted" },
  savings: { icon: PiggyBank, card: "from-foreground/15 to-muted" },
  investment: { icon: LineChart, card: "from-bucket-tithe/30 to-muted" },
  credit_card: { icon: CreditCard, card: "from-warning/30 to-muted" },
  loan: { icon: CreditCard, card: "from-destructive/25 to-muted" },
};
const FALLBACK = { icon: Landmark, card: "from-muted to-muted" };

/**
 * One account as a bank card. A debt shows what is owed; a balance below zero
 * is flagged, never hidden. Pressing it opens the account's details.
 */
export function AccountTile({
  name,
  type,
  typeLabel,
  institution,
  currency,
  amountText,
  amountCaption,
  status,
  belowZero,
  open,
  onToggle,
  controls,
}: {
  name: string;
  type: string;
  typeLabel: string;
  institution: string | null;
  currency: string;
  /** The balance, or the amount owed, already formatted */
  amountText: string;
  amountCaption?: string;
  status: string;
  belowZero: boolean;
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  const look = LOOK[type] ?? FALLBACK;
  const Icon = look.icon;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        "relative flex aspect-[1.9/1] min-h-32 w-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-gradient-to-br p-4 text-left shadow-[var(--shadow-glass)] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "motion-safe:[@media(hover:hover)]:hover:-translate-y-0.5",
        look.card,
        status !== "active" && "opacity-65",
        open && "ring-2 ring-primary"
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {typeLabel}
            {institution ? ` · ${institution}` : ""} · {currency}
            {status !== "active" ? ` · ${status}` : ""}
          </span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/50 text-foreground" aria-hidden>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </span>
      <span>
        <span className="block font-display text-2xl font-bold tabular-nums tracking-tight">{amountText}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {amountCaption}
          {belowZero && <span className="rounded-full bg-destructive/20 px-2 py-0.5 font-semibold text-destructive">below zero</span>}
        </span>
      </span>
    </button>
  );
}
