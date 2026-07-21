/**
 * WATERFALL ENGINE — the heart of FinTrack money math.
 *
 * Takes "gross income" + a user's budget plan (ordered buckets) and returns
 * how much goes into each bucket.
 *
 * Three allocation modes (per bucket):
 *  1. of_gross         — % of original income (e.g. tithe 10% of everything)
 *  2. of_remaining     — % of what's left after earlier steps (e.g. emergency)
 *  3. share_remainder  — several buckets split the SAME leftover pot by weight
 *                        (e.g. invest 40 / give 10 / save 40 / spend 10)
 *
 * Tithe-first example (₦100,000):
 *   tithe 10% of_gross        → ₦10,000  (left ₦90,000)
 *   emergency 10% of_remaining → ₦9,000  (left ₦81,000)
 *   invest/give/save/spend share 40/10/40/10 of ₦81,000
 */
import type { BudgetPlan, PlanBucket, WaterfallLine, WaterfallResult } from "./types";

export function allocateWaterfall(
  gross: number,
  plan: Pick<BudgetPlan, "buckets">
): WaterfallResult {
  if (!Number.isFinite(gross) || gross < 0) {
    return { gross: 0, lines: [], allocatedTotal: 0, unallocated: 0 };
  }

  // Always process buckets in plan order
  const buckets = [...plan.buckets].sort((a, b) => a.order - b.order);
  let remaining = gross;
  const lines: WaterfallLine[] = [];
  let i = 0;

  while (i < buckets.length) {
    const b = buckets[i];

    // --- Parallel split group (share the same pot) ---
    if (b.mode === "share_remainder") {
      const group: PlanBucket[] = [];
      while (i < buckets.length && buckets[i].mode === "share_remainder") {
        group.push(buckets[i]);
        i++;
      }
      const weightSum = group.reduce((s, x) => s + Math.max(0, x.percent), 0);
      const pot = remaining;
      for (const g of group) {
        const allocated =
          weightSum > 0 ? pot * (Math.max(0, g.percent) / weightSum) : 0;
        lines.push(toLine(g, allocated, gross));
      }
      remaining = 0; // pot fully distributed among the group
      continue;
    }

    // --- Sequential take (of_gross or of_remaining) ---
    const allocated = amountSequential(gross, remaining, b);
    remaining = Math.max(0, remaining - allocated);
    lines.push(toLine(b, allocated, gross));
    i++;
  }

  const allocatedTotal = lines.reduce((s, l) => s + l.allocated, 0);
  return {
    gross,
    lines,
    allocatedTotal,
    unallocated: Math.max(0, gross - allocatedTotal),
  };
}

function amountSequential(
  gross: number,
  remaining: number,
  b: PlanBucket
): number {
  const pct = Math.max(0, Math.min(100, b.percent)) / 100;
  if (b.mode === "of_gross") return gross * pct;
  return remaining * pct; // of_remaining
}

function toLine(b: PlanBucket, allocated: number, gross: number): WaterfallLine {
  return {
    bucketId: b.id,
    name: b.name,
    emoji: b.emoji,
    allocated,
    percentOfGross: gross > 0 ? (allocated / gross) * 100 : 0,
    mode: b.mode,
    carryOver: b.carryOver,
  };
}

/**
 * Soft validation for onboarding/settings forms.
 * errors = must fix; warnings = plan works but may leave money unallocated.
 */
export function validatePlan(plan: Pick<BudgetPlan, "buckets" | "name">): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!plan.name?.trim()) errors.push("Plan needs a name.");
  if (!plan.buckets?.length) errors.push("Add at least one bucket.");

  const ids = new Set<string>();
  for (const b of plan.buckets || []) {
    if (!b.id) errors.push("Every bucket needs an id.");
    if (ids.has(b.id)) errors.push(`Duplicate bucket id: ${b.id}`);
    ids.add(b.id);
    if (!b.name?.trim()) errors.push("Every bucket needs a name.");
    if (b.percent < 0 || b.percent > 100) {
      errors.push(`${b.name || b.id}: percent must be 0–100.`);
    }
  }

  // Flat plans (all of_gross) should usually sum to ~100%
  const allGross = (plan.buckets || []).every((b) => b.mode === "of_gross");
  if (allGross && plan.buckets.length) {
    const sum = plan.buckets.reduce((s, b) => s + b.percent, 0);
    if (Math.abs(sum - 100) > 0.5) {
      warnings.push(
        `Flat split adds up to ${sum.toFixed(1)}% (aim for 100% of income).`
      );
    }
  }

  const share = (plan.buckets || []).filter((b) => b.mode === "share_remainder");
  if (share.length) {
    const sum = share.reduce((s, b) => s + b.percent, 0);
    if (Math.abs(sum - 100) > 0.5) {
      warnings.push(
        `Remainder split weights add to ${sum.toFixed(1)}% (usually 100).`
      );
    }
  }

  if (plan.buckets?.length) {
    const sim = allocateWaterfall(100, plan);
    if (sim.unallocated > 1) {
      warnings.push(
        `About ${sim.unallocated.toFixed(1)}% of income is unallocated with this plan.`
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
