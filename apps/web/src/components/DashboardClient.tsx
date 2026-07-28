"use client";

/**
 * Liquid-finance dashboard — cinematic layout (PR2).
 * UI only: same props / delete / modal flows as before.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import {
  type BudgetPlan,
  type CurrencyCode,
  type DashboardLayout,
  type MonthBucketState,
  type WaterfallResult,
} from "@fintrack/domain";
import { LogTransactionModal } from "./LogTransactionModal";
import { DashboardCustomize } from "./DashboardCustomize";
import { AppShell } from "./AppShell";
import { GlassCard } from "./GlassCard";
import { Money } from "./Money";
import { NetWorthHero } from "./dashboard/NetWorthHero";
import { StatStack3D } from "./dashboard/StatStack3D";
import { KpiRow } from "./dashboard/KpiRow";
import {
  RecentTransactionsPanel,
  type DashTx,
} from "./dashboard/RecentTransactionsPanel";
import { BudgetOverviewPanel } from "./dashboard/BudgetOverviewPanel";

type Tx = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  bucketId: string | null;
  sourceId: string | null;
  category: string | null;
  note: string | null;
  reason: string | null;
  override: boolean;
  date: string;
};

type Source = {
  id: string;
  name: string;
  emoji: string;
  currency: string;
};

type Props = {
  email: string;
  baseCurrency: string;
  onboarding: string;
  plan: BudgetPlan | null;
  fx: Record<string, number>;
  sources: Source[];
  snapshot: {
    income: number;
    expenses: number;
    net: number;
    waterfall: WaterfallResult | null;
    buckets: MonthBucketState[];
  };
  sampleWaterfall: WaterfallResult | null;
  transactions: Tx[];
  inboxUnread: number;
  daysLeft: number;
  layout: DashboardLayout;
  forecastNext?: {
    gross: number;
    lines: {
      bucketId: string;
      name: string;
      emoji: string;
      allocated: number;
    }[];
  } | null;
};

const COLOR_VARS = [
  "--primary",
  "--accent-violet",
  "--accent-cyan",
  "--success",
  "--bucket-give",
  "--bucket-spend",
];

export function DashboardClient(props: Props) {
  const {
    email,
    baseCurrency,
    onboarding,
    plan,
    fx,
    sources,
    snapshot,
    transactions,
    inboxUnread,
    daysLeft,
    layout,
    forecastNext = null,
  } = props;
  const router = useRouter();
  const reduce = useReducedMotion();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const base = baseCurrency as CurrencyCode;

  const income = snapshot.income;
  const expenses = snapshot.expenses;
  const net = snapshot.net;
  const savingsRate =
    income > 0 ? Math.max(0, Math.min(100, ((income - expenses) / income) * 100)) : 0;

  const investBucket = snapshot.buckets.find(
    (b) => b.bucketId === "invest" || b.bucketId === "savings"
  );
  const investments = investBucket
    ? Math.max(0, investBucket.opening + investBucket.allocated)
    : 0;

  const budgetSlices = useMemo(() => {
    if (!plan) return [];
    const fromSnap =
      snapshot.buckets.length > 0
        ? snapshot.buckets
        : plan.buckets.map((b) => ({
            bucketId: b.id,
            opening: 0,
            allocated: 0,
            spent: 0,
            closing: 0,
          }));
    return fromSnap.map((b, i) => {
      const meta = plan.buckets.find((x) => x.id === b.bucketId);
      return {
        id: b.bucketId,
        name: meta?.name || b.bucketId,
        spent: b.spent,
        alloc: b.opening + b.allocated,
        colorVar: COLOR_VARS[i % COLOR_VARS.length],
      };
    });
  }, [plan, snapshot.buckets]);

  async function deleteTx(id: string) {
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

  const labelFor = (t: DashTx) => {
    if (t.type === "i") {
      const s = sources.find((x) => x.id === t.sourceId);
      return {
        title: s ? s.name : "Income",
        category: t.category || "Income",
      };
    }
    const b = plan?.buckets.find((x) => x.id === t.bucketId);
    return {
      title: t.note?.trim() || b?.name || "Expense",
      category: t.category || b?.name || "Expense",
    };
  };

  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : 0.06 },
    },
  };
  const item = {
    hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: "easeOut" as const },
    },
  };

  return (
    <AppShell
      baseCurrency={baseCurrency}
      email={email}
      inboxUnread={inboxUnread}
    >
      <motion.div
        className="mx-auto flex w-full max-w-[1400px] flex-col gap-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div
          variants={item}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <div>
            <p className="text-xs text-muted-foreground">
              {daysLeft} days left this month
            </p>
          </div>
          <DashboardCustomize layout={layout} />
        </motion.div>

        {onboarding === "skipped" && !plan && (
          <motion.div variants={item}>
            <GlassCard className="p-4 text-sm text-muted-foreground">
              Plan not set —{" "}
              <Link
                href="/settings"
                className="font-medium text-primary hover:underline"
              >
                choose a template in Plan settings
              </Link>
              .
            </GlassCard>
          </motion.div>
        )}

        {/* 5a + 5b hero row */}
        <motion.div
          variants={item}
          className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
        >
          <NetWorthHero total={income} currency={base} />
          <StatStack3D
            income={income}
            expenses={expenses}
            net={net}
            currency={base}
          />
        </motion.div>

        {/* 5c KPIs */}
        <motion.div variants={item}>
          <KpiRow
            income={income}
            expenses={expenses}
            savingsRate={savingsRate}
            investments={investments}
            currency={base}
          />
        </motion.div>

        {/* 5d + 5e */}
        <motion.div
          variants={item}
          className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
        >
          <RecentTransactionsPanel
            rows={transactions.slice(0, 8)}
            labelFor={labelFor}
            onDelete={deleteTx}
            deleting={deleting}
            onLog={() => setModalOpen(true)}
          />
          <BudgetOverviewPanel slices={budgetSlices} currency={base} />
        </motion.div>

        {forecastNext && forecastNext.gross > 0 && (
          <motion.div variants={item}>
            <GlassCard className="p-5">
              <div className="text-sm font-semibold text-foreground">
                Next month projection
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Based on this month&apos;s income pattern + recurring rules
              </p>
              <div className="mt-3 font-display text-2xl" data-money>
                <Money amount={forecastNext.gross} currency={base} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {forecastNext.lines.slice(0, 6).map((l) => (
                  <span
                    key={l.bucketId}
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
                  >
                    {l.emoji} {l.name}:{" "}
                    <Money amount={l.allocated} currency={base} />
                  </span>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>

      <motion.button
        type="button"
        className="fab"
        data-testid="fab"
        title="Log transaction"
        aria-label="Log transaction"
        onClick={() => setModalOpen(true)}
        whileTap={reduce ? undefined : { scale: 0.93 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </motion.button>

      <LogTransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        plan={plan}
        sources={sources}
        baseCurrency={baseCurrency}
        fx={fx}
      />
    </AppShell>
  );
}
