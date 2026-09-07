import type { PlanTemplate, BudgetPlan, PlanBucket } from "./types";

/**
 * Create a bucket using the new explicit layer semantics.
 */
function bucket(
  id: string,
  name: string,
  emoji: string,
  layer: PlanBucket["layer"],
  percent: number,
  mode: PlanBucket["mode"],
  carryOver: boolean,
  order: number,
  fixed?: number
): PlanBucket {
  return {
    id,
    name,
    emoji,
    layer,
    percent,
    mode,
    carryOver,
    order,
    ...(fixed !== undefined ? { fixed } : {}),
  };
}

/** Glory's original plan. */
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
      bucket(
        "tithe",
        "Tithe",
        "✝️",
        "mandatory",
        10,
        "of_gross",
        true,
        0
      ),
      bucket(
        "emergency",
        "Emergency",
        "🆘",
        "off_the_top",
        10,
        "of_remaining",
        true,
        1
      ),
      bucket(
        "invest",
        "Invest",
        "📈",
        "life_plan",
        40,
        "share_remainder",
        true,
        2
      ),
      bucket(
        "give",
        "Give",
        "🎁",
        "life_plan",
        10,
        "share_remainder",
        false,
        3
      ),
      bucket(
        "save",
        "Save",
        "💰",
        "life_plan",
        40,
        "share_remainder",
        true,
        4
      ),
      bucket(
        "spend",
        "Spend",
        "💸",
        "life_plan",
        10,
        "share_remainder",
        false,
        5
      ),
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
      bucket(
        "emergency",
        "Emergency",
        "🆘",
        "life_plan",
        10,
        "share_remainder",
        true,
        0
      ),
      bucket(
        "invest",
        "Invest",
        "📈",
        "life_plan",
        20,
        "share_remainder",
        true,
        1
      ),
      bucket(
        "save",
        "Save",
        "💰",
        "life_plan",
        20,
        "share_remainder",
        true,
        2
      ),
      bucket(
        "give",
        "Give",
        "🎁",
        "life_plan",
        5,
        "share_remainder",
        false,
        3
      ),
      bucket(
        "spend",
        "Living",
        "🏠",
        "life_plan",
        45,
        "share_remainder",
        false,
        4
      ),
    ],
  },
};

export const FIFTY_THIRTY_TWENTY: PlanTemplate = {
  id: "50_30_20",
  name: "50 / 30 / 20",
  description:
    "50% needs, 30% wants, 20% savings & debt payoff.",
  plan: {
    name: "50 / 30 / 20",
    templateId: "50_30_20",
    emergencyCarryOverDefault: true,
    buckets: [
      bucket(
        "needs",
        "Needs",
        "🏠",
        "life_plan",
        50,
        "share_remainder",
        false,
        0
      ),
      bucket(
        "wants",
        "Wants",
        "✨",
        "life_plan",
        30,
        "share_remainder",
        false,
        1
      ),
      bucket(
        "savings",
        "Savings & debt",
        "💰",
        "life_plan",
        20,
        "share_remainder",
        true,
        2
      ),
    ],
  },
};

export const ALL_TEMPLATES: PlanTemplate[] = [
  TITHE_FIRST_TEMPLATE,
  PAY_YOURSELF_FIRST_TEMPLATE,
  FIFTY_THIRTY_TWENTY,
];

export function getTemplate(
  id: string
): PlanTemplate | undefined {
  return ALL_TEMPLATES.find(
    (template) => template.id === id
  );
}

/**
 * Clone a template into a real BudgetPlan with a new id.
 */
export function planFromTemplate(
  templateId: string,
  planId: string
): BudgetPlan | null {
  const template = getTemplate(templateId);

  if (!template) return null;

  return {
    id: planId,
    ...template.plan,
    buckets: template.plan.buckets.map(
      (bucket) => ({ ...bucket })
    ),
  };
}

/**
 * Create a custom template from a user's configured plan.
 *
 * The template is a snapshot of the waterfall configuration.
 * The actual persisted user template/version will be handled
 * by the application/service layer.
 */
export function createCustomTemplate(
  id: string,
  name: string,
  plan: Pick<
    BudgetPlan,
    "buckets" | "emergencyCarryOverDefault"
  >
): PlanTemplate {
  return {
    id,
    name,
    description:
      "Custom FinTrack waterfall.",
    plan: {
      name,
      templateId: id,
      emergencyCarryOverDefault:
        plan.emergencyCarryOverDefault,
      buckets: plan.buckets.map(
        (bucket) => ({ ...bucket })
      ),
    },
  };
}