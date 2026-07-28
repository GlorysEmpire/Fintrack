"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Wallet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard } from "@/components/GlassCard";
import { Money } from "@/components/Money";
import { useCountUp } from "@/hooks/useCountUp";
import { formatTxDate } from "@/lib/format-date";

type Source = {
  id: string;
  name: string;
  emoji: string;
  currency: string;
  logged: number;
};

type Tx = {
  id: string;
  amount: number;
  currency: string;
  sourceId: string | null;
  note: string | null;
  date: string;
};

export function IncomeClient({
  baseCurrency,
  email,
  inboxUnread,
  total,
  sources,
  recent,
}: {
  baseCurrency: string;
  email: string;
  inboxUnread: number;
  total: number;
  sources: Source[];
  recent: Tx[];
}) {
  const reduce = useReducedMotion();
  const anim = useCountUp(total, 1200);

  return (
    <AppShell baseCurrency={baseCurrency} email={email} inboxUnread={inboxUnread}>
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Income</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sources and amounts logged this month.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <GlassCard motionEnter className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Logged this month
            </div>
            <div className="mt-2 font-display text-3xl text-success" data-money>
              <Money amount={anim} currency={baseCurrency} />
            </div>
          </GlassCard>
          <GlassCard motionEnter className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sources
            </div>
            <div className="mt-2 font-display text-3xl tabular-nums">
              {sources.length}
            </div>
          </GlassCard>
        </div>

        <div className="sec">Income sources</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sources.map((s, i) => (
            <motion.div
              key={s.id}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <GlassCard interactive className="p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-lg">
                    {s.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.currency}
                    </div>
                  </div>
                  <div className="font-display text-lg text-success" data-money>
                    <Money amount={s.logged} currency={baseCurrency} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
          {sources.length === 0 && (
            <GlassCard className="p-6">
              <EmptyHint />
            </GlassCard>
          )}
        </div>

        <div className="sec">Recent income</div>
        <GlassCard className="p-2 sm:p-4">
          {recent.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No income yet.{" "}
              <Link href="/dashboard" className="text-primary hover:underline">
                Log from Overview
              </Link>
            </p>
          ) : (
            recent.map((t) => {
              const src = sources.find((s) => s.id === t.sourceId);
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between border-b border-border px-2 py-3 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {src ? `${src.emoji} ${src.name}` : "Income"}
                      {t.note ? (
                        <span className="text-muted-foreground"> · {t.note}</span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatTxDate(t.date)}
                    </div>
                  </div>
                  <div className="font-display text-success" data-money>
                    +
                    <Money amount={t.amount} currency={t.currency} />
                  </div>
                </div>
              );
            })
          )}
        </GlassCard>
      </div>
    </AppShell>
  );
}

function EmptyHint() {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
      <Wallet className="h-8 w-8 text-primary/60" />
      Default sources appear after first visit to the dashboard.
    </div>
  );
}
