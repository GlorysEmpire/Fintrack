"use client";

/**
 * Goals timeline — buckets as goals with liquid-fill bars (UI only).
 */
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Target } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard } from "@/components/GlassCard";
import { Money } from "@/components/Money";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

export type GoalItem = {
  id: string;
  name: string;
  emoji: string;
  target: number;
  progress: number;
  colorVar: string;
};

export function GoalsClient({
  baseCurrency,
  email,
  inboxUnread,
  goals,
}: {
  baseCurrency: string;
  email: string;
  inboxUnread: number;
  goals: GoalItem[];
}) {
  const reduce = useReducedMotion();

  return (
    <AppShell baseCurrency={baseCurrency} email={email} inboxUnread={inboxUnread}>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Goals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan buckets as monthly goals — fill reflects spend vs allocated
            share.
          </p>
        </div>

        {goals.length === 0 ? (
          <GlassCard className="p-6">
            <EmptyState
              icon={Target}
              title="No goals yet"
              description="Set a budget plan to turn buckets into goals."
              actionLabel="Open plan settings"
              onAction={() => {
                window.location.href = "/settings";
              }}
            />
          </GlassCard>
        ) : (
          <div className="relative pl-6">
            <div
              aria-hidden
              className="absolute bottom-4 left-[11px] top-4 w-px bg-gradient-to-b from-primary via-accent-violet to-transparent"
              style={{
                background:
                  "linear-gradient(to bottom, var(--primary), var(--accent-violet), transparent)",
              }}
            />
            <ul className="flex flex-col gap-4">
              {goals.map((g, i) => {
                const pct =
                  g.target > 0
                    ? Math.min(100, (g.progress / g.target) * 100)
                    : 0;
                return (
                  <motion.li
                    key={g.id}
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.4 }}
                    className="relative list-none"
                  >
                    <span
                      className="absolute -left-6 top-6 h-3 w-3 rounded-full border-2 border-background"
                      style={{ background: `var(${g.colorVar})` }}
                      aria-hidden
                    />
                    <GlassCard interactive className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground">
                            {g.emoji} {g.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            Target{" "}
                            <Money amount={g.target} currency={baseCurrency} />
                          </div>
                        </div>
                        <span className="font-display text-lg tabular-nums text-primary">
                          {Math.round(pct)}%
                        </span>
                      </div>
                      {/* liquid fill bar */}
                      <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className="relative h-full rounded-full"
                          style={{
                            background: `linear-gradient(90deg, var(${g.colorVar}), color-mix(in oklab, var(--primary-glow) 70%, var(${g.colorVar})))`,
                          }}
                          initial={reduce ? false : { width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{
                            duration: 1.2,
                            ease: [0.16, 1, 0.3, 1],
                            delay: i * 0.05,
                          }}
                        >
                          {!reduce && (
                            <span
                              className="absolute inset-0 opacity-40"
                              style={{
                                background:
                                  "linear-gradient(180deg, transparent 30%, color-mix(in oklab, var(--foreground) 25%, transparent))",
                              }}
                            />
                          )}
                        </motion.div>
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                        <span data-money>
                          <Money amount={g.progress} currency={baseCurrency} />{" "}
                          used
                        </span>
                        <span
                          className={cn(
                            pct >= 100 ? "text-destructive" : "text-success"
                          )}
                          data-money
                        >
                          <Money
                            amount={Math.max(0, g.target - g.progress)}
                            currency={baseCurrency}
                          />{" "}
                          left
                        </span>
                      </div>
                    </GlassCard>
                  </motion.li>
                );
              })}
            </ul>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Adjust plan in{" "}
              <Link href="/settings" className="text-primary hover:underline">
                Settings
              </Link>
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
