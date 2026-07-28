"use client";

/**
 * Budget rings per plan bucket + drag reorder (local preview only — no API).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Reorder, useReducedMotion, motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard } from "@/components/GlassCard";
import { Money } from "@/components/Money";
import { cn } from "@/lib/utils";

export type BudgetItem = {
  id: string;
  name: string;
  emoji: string;
  percent: number;
  alloc: number;
  spent: number;
  colorVar: string;
};

function Ring({
  pct,
  colorVar,
  size = 88,
}: {
  pct: number;
  colorVar: string;
  size?: number;
}) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const dash = (clamped / 100) * c;

  return (
    <svg width={size} height={size} viewBox="0 0 88 88" className="-rotate-90">
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth="8"
      />
      <motion.circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke={`var(${colorVar})`}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        initial={{ strokeDasharray: `0 ${c}` }}
        animate={{ strokeDasharray: `${dash} ${c}` }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

const VARS = [
  "--primary",
  "--accent-violet",
  "--accent-cyan",
  "--success",
  "--bucket-give",
  "--bucket-spend",
];

export function BudgetsClient({
  baseCurrency,
  email,
  inboxUnread,
  items: initial,
}: {
  baseCurrency: string;
  email: string;
  inboxUnread: number;
  items: BudgetItem[];
}) {
  const reduce = useReducedMotion();
  const [items, setItems] = useState(initial);
  const totalAlloc = useMemo(
    () => items.reduce((s, i) => s + i.alloc, 0),
    [items]
  );
  const totalSpent = useMemo(
    () => items.reduce((s, i) => s + i.spent, 0),
    [items]
  );

  return (
    <AppShell baseCurrency={baseCurrency} email={email} inboxUnread={inboxUnread}>
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Budgets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Animated rings from this month&apos;s allocation vs spend. Drag to
            reorder for planning preview (not saved).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <GlassCard className="p-4">
            <div className="text-[11px] uppercase text-muted-foreground">
              Allocated
            </div>
            <div className="mt-1 font-display text-2xl" data-money>
              <Money amount={totalAlloc} currency={baseCurrency} />
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-[11px] uppercase text-muted-foreground">
              Spent
            </div>
            <div className="mt-1 font-display text-2xl text-destructive" data-money>
              <Money amount={totalSpent} currency={baseCurrency} />
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-[11px] uppercase text-muted-foreground">
              Remaining
            </div>
            <div className="mt-1 font-display text-2xl text-success" data-money>
              <Money
                amount={Math.max(0, totalAlloc - totalSpent)}
                currency={baseCurrency}
              />
            </div>
          </GlassCard>
        </div>

        {items.length === 0 ? (
          <GlassCard className="p-8 text-center text-sm text-muted-foreground">
            No plan yet.{" "}
            <Link href="/settings" className="text-primary hover:underline">
              Choose a template
            </Link>
            .
          </GlassCard>
        ) : (
          <Reorder.Group
            axis="y"
            values={items}
            onReorder={setItems}
            className="flex flex-col gap-3"
          >
            {items.map((b, idx) => {
              const pct = b.alloc > 0 ? (b.spent / b.alloc) * 100 : 0;
              const colorVar = b.colorVar || VARS[idx % VARS.length];
              return (
                <Reorder.Item
                  key={b.id}
                  value={b}
                  dragListener={!reduce}
                  className="list-none"
                >
                  <GlassCard
                    interactive
                    className="flex cursor-grab flex-col items-center gap-4 p-4 active:cursor-grabbing sm:flex-row sm:items-center"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <GripVertical className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Drag to reorder</span>
                    </div>
                    <div className="relative">
                      <Ring pct={pct} colorVar={colorVar} />
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
                        {Math.round(pct)}%
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 text-center sm:text-left">
                      <div className="font-semibold text-foreground">
                        {b.emoji} {b.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {b.percent}% of plan
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full")}
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            background: `var(${colorVar})`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-center sm:text-right">
                      <div className="text-[11px] text-muted-foreground">Spent</div>
                      <div className="font-display tabular-nums" data-money>
                        <Money amount={b.spent} currency={baseCurrency} />
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        of{" "}
                        <Money amount={b.alloc} currency={baseCurrency} />
                      </div>
                    </div>
                  </GlassCard>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        )}
      </div>
    </AppShell>
  );
}
