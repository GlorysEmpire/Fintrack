"use client";

/**
 * Expenses / transactions table — glass sticky header, category chips.
 * Filters client-side only; delete uses existing DELETE API.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard } from "@/components/GlassCard";
import { Money } from "@/components/Money";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { formatTxDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Receipt } from "lucide-react";

export type TxRow = {
  id: string;
  amount: number;
  currency: string;
  bucketId: string | null;
  note: string | null;
  reason: string | null;
  override: boolean;
  date: string;
  category: string | null;
};

type Bucket = { id: string; name: string; emoji: string };

export function TransactionsClient({
  baseCurrency,
  email,
  inboxUnread,
  rows,
  buckets,
}: {
  baseCurrency: string;
  email: string;
  inboxUnread: number;
  rows: TxRow[];
  buckets: Bucket[];
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");

  const chips = useMemo(() => {
    const ids = new Set(rows.map((r) => r.bucketId).filter(Boolean) as string[]);
    return buckets.filter((b) => ids.has(b.id));
  }, [rows, buckets]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.bucketId !== filter) return false;
      if (!q.trim()) return true;
      const hay = `${r.note || ""} ${r.reason || ""} ${r.category || ""}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    });
  }, [rows, filter, q]);

  async function onDelete(id: string) {
    if (!confirm("Delete this transaction?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(null);
    }
  }

  function bucketName(id: string | null) {
    if (!id) return "Expense";
    const b = buckets.find((x) => x.id === id);
    return b ? `${b.emoji} ${b.name}` : id;
  }

  return (
    <AppShell baseCurrency={baseCurrency} email={email} inboxUnread={inboxUnread}>
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Expenses this month. Overrides are tagged. Steward notes go to{" "}
            <Link href="/inbox" className="text-primary hover:underline">
              Inbox
            </Link>
            .
          </p>
        </div>

        <GlassCard className="overflow-hidden p-0">
          <div className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_oklab,var(--surface-1)_80%,transparent)] px-4 py-3 backdrop-blur-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                <Chip
                  active={filter === "all"}
                  onClick={() => setFilter("all")}
                  label="All"
                />
                {chips.map((c) => (
                  <Chip
                    key={c.id}
                    active={filter === c.id}
                    onClick={() => setFilter(c.id)}
                    label={`${c.emoji} ${c.name}`}
                  />
                ))}
              </div>
              <div className="relative max-w-xs flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  className="h-9 pl-9"
                  placeholder="Filter notes…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Filter transactions"
                />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No matching expenses"
              description="Log an expense from Overview, or clear filters."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">Merchant / note</th>
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium text-right">Amount</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, i) => (
                    <motion.tr
                      key={t.id}
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.025 }}
                      className="border-b border-border/60 hover:bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]"
                    >
                      <td className="px-4 py-3">
                        {editingId === t.id ? (
                          <Input
                            className="h-8"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            onBlur={() => setEditingId(null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "Escape")
                                setEditingId(null);
                            }}
                            autoFocus
                            aria-label="Note (display only — save not yet available)"
                            title="Note preview only — API has no update endpoint yet"
                          />
                        ) : (
                          <button
                            type="button"
                            className="text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                            onClick={() => {
                              setEditingId(t.id);
                              setEditNote(t.note || "");
                            }}
                          >
                            {editNote && editingId === t.id
                              ? editNote
                              : t.note || "—"}
                            {t.override && (
                              <span className="ml-2 rounded-full bg-[color-mix(in_oklab,var(--bucket-spend)_15%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--bucket-spend)]">
                                override
                              </span>
                            )}
                          </button>
                        )}
                        {t.reason && (
                          <div className="mt-0.5 text-[11px] italic text-muted-foreground">
                            “{t.reason}”
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {bucketName(t.bucketId)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatTxDate(t.date)}
                      </td>
                      <td className="px-4 py-3 text-right font-display text-destructive tabular-nums">
                        −
                        <Money amount={t.amount} currency={t.currency} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          disabled={deleting === t.id}
                          onClick={() => onDelete(t.id)}
                          aria-label="Delete"
                        >
                          ×
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>
    </AppShell>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}
