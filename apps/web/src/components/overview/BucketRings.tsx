"use client";

import Link from "next/link";
import { Droplets } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import {
  activeBuckets,
  bucketRuleLabel,
  formatMoney,
  sortBucketsByPlanOrder,
  type BudgetPlan,
  type CurrencyCode,
  type MonthBucketState,
} from "@fintrack/domain";
import { bucketColor } from "@/lib/bucket-colors";
import { InfoTip } from "@/components/ui/info-tip";
import { ProgressRing } from "./ProgressRing";
import { SectionTitle } from "./SectionTitle";

type Props = {
  plan: BudgetPlan | null;
  states: MonthBucketState[];
  base: CurrencyCode;
  scope: "total" | "month";
};

/** One ring per bucket: how much of it is still there, in plain words. */
export function BucketRings({ plan, states, base, scope }: Props) {
  const reduce = useReducedMotion();
  const hint = scope === "total" ? "all time" : "this month";

  if (!plan) {
    return (
      <div className="card">
        <SectionTitle icon={Droplets}>Your buckets</SectionTitle>
        <p className="text-xs text-subtle">
          <Link href="/settings">Set a plan</Link> to track buckets.
        </p>
      </div>
    );
  }

  const byId = new Map(states.map((b) => [b.bucketId, b]));
  const cards = sortBucketsByPlanOrder(activeBuckets(plan.buckets)).map((meta, i) => {
    const b = byId.get(meta.id);
    // What it held before spending, counting any approved exception, and what is left
    const alloc = b ? b.opening + b.allocated + b.moved : 0;
    const left = b ? b.closing : 0;
    const over = left < 0;
    const fraction = alloc > 0 ? left / alloc : 0;
    const status = over
      ? "below zero"
      : alloc <= 0
        ? "nothing allocated yet"
        : left === 0
          ? "used up"
          : fraction < 0.15
            ? "running low"
            : "";
    const color = over
      ? "var(--color-destructive)"
      : status === "running low"
        ? "var(--color-warning)"
        : bucketColor(meta.id, i);
    return { id: meta.id, meta, alloc, left, over, fraction, status, color };
  });

  return (
    <div className="card">
      <SectionTitle icon={Droplets} hint={hint}>
        Your buckets
      </SectionTitle>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <motion.div
            key={c.id}
            className="rounded-xl border border-border bg-muted/40 p-3"
            animate={c.over && !reduce ? { x: [0, -4, 4, -3, 3, 0] } : undefined}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-3">
              <ProgressRing fraction={c.over ? 1 : c.fraction} color={c.color}>
                <span aria-hidden>{c.meta.emoji}</span>
              </ProgressRing>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <div className="truncate text-sm font-semibold">{c.meta.name || c.id}</div>
                  <InfoTip label={`How the ${c.meta.name || c.id} bucket works`} align="end">
                    {bucketRuleLabel(c.meta, base)}
                    {c.meta.carryOver ? " · carries over" : " · resets monthly"}
                  </InfoTip>
                </div>
                <div className="font-display text-base font-semibold tabular-nums" style={{ color: c.over ? c.color : undefined }}>
                  {c.over ? "−" : ""}
                  {formatMoney(Math.abs(c.left), base)} <span className="text-xs font-normal text-muted-foreground">left</span>
                </div>
                <div className="text-xs text-subtle">
                  of {formatMoney(c.alloc, base)}
                  {c.status && <span style={{ color: c.color }}> · {c.status}</span>}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
