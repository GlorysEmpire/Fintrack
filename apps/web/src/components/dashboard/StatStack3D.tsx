"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  RefreshCcw,
} from "lucide-react";
import { Money } from "@/components/Money";
import { Sparkline, sparkFromSeed } from "./Sparkline";
import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";

type StackItem = {
  id: string;
  label: string;
  sub: string;
  amount: number;
  currency: string;
  tone: "success" | "danger" | "primary";
  deltaPct?: number | null;
};

function StackCard({
  item,
  index,
  reduce,
}: {
  item: StackItem;
  index: number;
  reduce: boolean | null;
}) {
  const anim = useCountUp(item.amount, 1200);
  const Icon =
    item.tone === "success"
      ? ArrowUpRight
      : item.tone === "danger"
        ? ArrowDownRight
        : RefreshCcw;

  const flat = {
    rotateY: 0,
    rotateX: 0,
    z: 40,
    y: -8,
  };
  const stacked = {
    rotateY: -8,
    rotateX: 4,
    z: index * 28,
    y: index * 12,
  };

  return (
    <motion.div
      className={cn(
        "glass-card relative w-full max-w-[320px] p-4 will-change-transform",
        "border-[color-mix(in_oklab,var(--primary)_25%,transparent)]"
      )}
      style={{
        transformStyle: "preserve-3d",
        marginTop: index === 0 ? 0 : -12,
        zIndex: 10 - index,
      }}
      initial={false}
      animate={
        reduce
          ? { y: 0 }
          : {
              rotateY: stacked.rotateY,
              rotateX: stacked.rotateX,
              y: stacked.y,
            }
      }
      whileHover={reduce ? undefined : flat}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              item.tone === "success" && "bg-success/15 text-success",
              item.tone === "danger" && "bg-destructive/15 text-destructive",
              item.tone === "primary" && "bg-primary/15 text-primary"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {item.label}
            </div>
            <div className="text-[11px] text-muted-foreground">{item.sub}</div>
          </div>
        </div>
        {item.deltaPct != null && (
          <span
            className={cn(
              "text-[11px] font-semibold tabular-nums",
              (item.deltaPct ?? 0) >= 0 ? "text-success" : "text-destructive"
            )}
          >
            {(item.deltaPct ?? 0) >= 0 ? "↑" : "↓"}{" "}
            {Math.abs(item.deltaPct ?? 0).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div
          className="font-display text-2xl tracking-tight text-foreground"
          data-money
        >
          <Money amount={anim} currency={item.currency} />
        </div>
        <Sparkline
          values={sparkFromSeed(item.amount + index * 17)}
          tone={
            item.tone === "success"
              ? "success"
              : item.tone === "danger"
                ? "danger"
                : "cyan"
          }
        />
      </div>
    </motion.div>
  );
}

export function StatStack3D({
  income,
  expenses,
  net,
  currency,
  className,
}: {
  income: number;
  expenses: number;
  net: number;
  currency: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const items: StackItem[] = [
    {
      id: "income",
      label: "Income",
      sub: "This month",
      amount: income,
      currency,
      tone: "success",
    },
    {
      id: "expenses",
      label: "Expenses",
      sub: "This month",
      amount: expenses,
      currency,
      tone: "danger",
    },
    {
      id: "net",
      label: "Net cash flow",
      sub: "This month",
      amount: Math.abs(net),
      currency,
      tone: "primary",
    },
  ];

  return (
    <div
      className={cn(
        "relative flex min-h-[280px] items-center justify-center py-4 sm:min-h-[320px]",
        className
      )}
    >
      {/* aurora bloom behind stack */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[10%] rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--accent-violet) 45%, transparent), color-mix(in oklab, var(--accent-cyan) 30%, transparent) 45%, transparent 70%)",
        }}
      />
      <div
        className="relative w-full max-w-[340px]"
        style={{
          perspective: reduce ? undefined : 1200,
          transformStyle: "preserve-3d",
        }}
      >
        {items.map((item, i) => (
          <StackCard key={item.id} item={item} index={i} reduce={reduce} />
        ))}
      </div>
    </div>
  );
}
