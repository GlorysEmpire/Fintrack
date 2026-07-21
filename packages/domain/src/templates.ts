/**
 * Built-in plan templates.
 * Users can pick one at first launch, or switch later in Settings.
 * Full custom bucket editor is a follow-up sprint; templates cover Sprint 1.
 */
import type { PlanTemplate } from "./types";

function bucket(
  id: string,
  name: string,
  emoji: string,
  percent: number,
  mode: "of_gross" | "of_remaining" | "share_remainder",
  carryOver: boolean,
  order: number
) {
  return { id, name, emoji, percent, mode, carryOver, order };
}

/** Glory's original plan — recommended default (optional; user can skip) */
export const TITHE_FIRST_TEMPLATE: PlanTemplate = {
  id: "tithe_first",
  name: "Tithe-first waterfall",
  description:
    "Faith-aligned plan: 10% tithe of gross, then emergency, then invest / give / save / spend on the remainder.",
  plan: {
    name: "Tithe-first waterfall",
    templateId: "tithe_first",
    emergencyCarryOverDefault: true,
    buckets: [
      bucket("tithe", "Tithe", "✝️", 10, "of_gross", false, 0),
      bucket("emergency", "Emergency", "🆘", 10, "of_remaining", true, 1),
      // These four share the same remaining pot (not sequential cuts)
      bucket("invest", "Invest", "📈", 40, "share_remainder", true, 2),
      bucket("give", "Give", "🎁", 10, "share_remainder", false, 3),
      bucket("save", "Save", "💰", 40, "share_remainder", true, 4),
      bucket("spend", "Spend", "💸", 10, "share_remainder", false, 5),
    ],
  },
};

export const PAY_YOURSELF_FIRST_TEMPLATE: PlanTemplate = {
  id: "pay_yourself_first",
  name: "Pay yourself first",
  description:
    "Classic approach: protect future you before lifestyle. Flat split of every income.",
  plan: {
    name: "Pay yourself first",
    templateId: "pay_yourself_first",
    emergencyCarryOverDefault: true,
    buckets: [
      bucket("emergency", "Emergency", "🆘", 10, "of_gross", true, 0),
      bucket("invest", "Invest", "📈", 20, "of_gross", true, 1),
      bucket("save", "Save", "💰", 20, "of_gross", true, 2),
      bucket("give", "Give", "🎁", 5, "of_gross", false, 3),
      bucket("spend", "Living", "🏠", 45, "of_gross", false, 4),
    ],
  },
};

export const FIFTY_THIRTY_TWENTY: PlanTemplate = {
  id: "50_30_20",
  name: "50 / 30 / 20",
  description: "50% needs, 30% wants, 20% savings & debt payoff.",
  plan: {
    name: "50 / 30 / 20",
    templateId: "50_30_20",
    emergencyCarryOverDefault: true,
    buckets: [
      bucket("needs", "Needs", "🏠", 50, "of_gross", false, 0),
      bucket("wants", "Wants", "✨", 30, "of_gross", false, 1),
      bucket("savings", "Savings & debt", "💰", 20, "of_gross", true, 2),
    ],
  },
};

export const ALL_TEMPLATES: PlanTemplate[] = [
  TITHE_FIRST_TEMPLATE,
  PAY_YOURSELF_FIRST_TEMPLATE,
  FIFTY_THIRTY_TWENTY,
];

export function getTemplate(id: string): PlanTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}

/** Clone a template into a real BudgetPlan with a new id */
export function planFromTemplate(
  templateId: string,
  planId: string
): import("./types").BudgetPlan | null {
  const t = getTemplate(templateId);
  if (!t) return null;
  return {
    id: planId,
    ...t.plan,
    buckets: t.plan.buckets.map((b) => ({ ...b })),
  };
}
