/**
 * PLAN RULES — what makes a budget plan valid, and what counts as changing it.
 *
 * The waterfall engine (waterfall.ts) turns a plan + income into allocations.
 * This file decides whether a plan may be saved at all, keeps bucket identity
 * stable, and describes plans in plain language. No database, no React.
 *
 * The layers are the domain's own: mandatory, off_the_top, life_plan.
 * "Needs / Wants / Savings" and friends are only templates built from them.
 */
import type {
  AllocationMode,
  BudgetPlan,
  PlanBucket,
  PlanTemplate,
  WaterfallLayer,
} from "./types";
import type { CurrencyCode } from "./fx";
import { formatMoney } from "./fx";
import { WATERFALL_LAYERS, bucketLayer } from "./waterfall";

export const MAX_PLAN_NAME_LENGTH = 60;
export const MAX_BUCKET_NAME_LENGTH = 40;
/** Counted in UTF-16 units: one emoji is often 2–4 of them. */
export const MAX_BUCKET_EMOJI_LENGTH = 16;
export const MAX_ACTIVE_BUCKETS = 20;
/** Active + archived */
export const MAX_TOTAL_BUCKETS = 60;

/** 33.33 + 33.33 + 33.34 must count as 100. */
const PERCENT_TOLERANCE = 0.01;

const ALLOCATION_MODES: readonly AllocationMode[] = [
  "of_gross",
  "of_remaining",
  "share_remainder",
];

/** Plain-language names for the three waterfall layers (used by every screen). */
export const LAYER_COPY: Record<
  WaterfallLayer,
  { label: string; tagline: string; summary: string }
> = {
  mandatory: {
    label: "Mandatory",
    tagline: "Comes first",
    summary:
      "Taken from your total income before anything else. Use it for obligations such as tithe or tax.",
  },
  off_the_top: {
    label: "Off the top",
    tagline: "Set aside next",
    summary:
      "Taken from what is left after the Mandatory buckets, before your life plan. Use it for something like an emergency fund.",
  },
  life_plan: {
    label: "Life plan",
    tagline: "Everything that is left",
    summary:
      "Whatever remains is shared between these buckets. Their percentages must add up to 100%, so all of your income lands in a bucket.",
  },
};

/* ─── Bucket identity ─────────────────────────────────────────────── */

const BUCKET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * Bucket ids are used as lookup keys everywhere (spending per bucket, opening
 * balances), so they are limited to a safe slug and may not shadow a built-in
 * object key such as "constructor".
 */
export function isValidBucketId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    BUCKET_ID_PATTERN.test(id) &&
    !(id in Object.prototype)
  );
}

/**
 * A fresh bucket id that collides with nothing already in use.
 *
 * Ids are generated, never typed by the user and never derived from the name,
 * so renaming a bucket can not change which transactions belong to it.
 */
export function newBucketId(
  existingIds: Iterable<string>,
  random: () => number = Math.random
): string {
  const taken = new Set(existingIds);
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = Math.floor(random() * 36 ** 8)
      .toString(36)
      .padStart(8, "0");
    const id = `b_${suffix}`;
    if (!taken.has(id)) return id;
  }
  // Only reachable with a broken random source: fall back to a counter.
  let n = taken.size + 1;
  while (taken.has(`b_${n}`)) n += 1;
  return `b_${n}`;
}

/* ─── Shape helpers ───────────────────────────────────────────────── */

export function hasFixedAmount(bucket: Pick<PlanBucket, "fixed">): boolean {
  return bucket.fixed != null;
}

/**
 * The allocation mode that goes with a layer.
 *
 * Nobody picks a mode by hand: it follows from the layer and from whether the
 * bucket takes a percentage or a fixed amount.
 *   mandatory   → of_gross        (share of total income, or a fixed amount)
 *   off_the_top → of_remaining    (share of what is left, or a fixed amount)
 *   life_plan   → share_remainder (percentage split of the rest)
 *                 of_remaining    (fixed amount, filled before the split)
 */
export function allocationModeFor(
  layer: WaterfallLayer,
  fixed: boolean
): AllocationMode {
  if (layer === "mandatory") return "of_gross";
  if (layer === "off_the_top") return "of_remaining";
  return fixed ? "of_remaining" : "share_remainder";
}

export function activeBuckets<T extends Pick<PlanBucket, "archived">>(
  buckets: T[]
): T[] {
  return buckets.filter((b) => !b.archived);
}

export function archivedBuckets<T extends Pick<PlanBucket, "archived">>(
  buckets: T[]
): T[] {
  return buckets.filter((b) => b.archived);
}

/** Buckets in the order the waterfall fills them: layer first, then the user's own order. */
export function sortBucketsByPlanOrder<
  T extends Pick<PlanBucket, "layer" | "mode" | "order">,
>(buckets: T[]): T[] {
  const rank = (b: T) => WATERFALL_LAYERS.indexOf(bucketLayer(b));
  return [...buckets].sort(
    (a, b) => rank(a) - rank(b) || (a.order ?? 0) - (b.order ?? 0)
  );
}

/**
 * Read buckets from storage defensively.
 *
 * Plans are stored as JSON. Plans saved before layers existed have no `layer`,
 * and nothing guarantees an old row has the shape the engine expects. Anything
 * that can be derived is filled in (layer from mode); anything unusable is
 * dropped. Nothing is invented: no allocation is ever made up here.
 */
export function normalizePlanBuckets(raw: unknown): PlanBucket[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanBucket[] = [];
  const seen = new Set<string>();

  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const b = item as Record<string, unknown>;
    if (typeof b.id !== "string" || !b.id || seen.has(b.id)) return;
    seen.add(b.id);

    const layerIn = WATERFALL_LAYERS.includes(b.layer as WaterfallLayer)
      ? (b.layer as WaterfallLayer)
      : undefined;
    const modeIn = ALLOCATION_MODES.includes(b.mode as AllocationMode)
      ? (b.mode as AllocationMode)
      : undefined;
    const fixed =
      typeof b.fixed === "number" && Number.isFinite(b.fixed) && b.fixed >= 0
        ? b.fixed
        : undefined;
    const mode =
      modeIn ?? allocationModeFor(layerIn ?? "life_plan", fixed !== undefined);
    // Same fallback the engine has always used for plans saved without a layer
    const layer: WaterfallLayer =
      layerIn ??
      (mode === "of_gross"
        ? "mandatory"
        : mode === "of_remaining"
          ? "off_the_top"
          : "life_plan");

    out.push({
      id: b.id,
      name: typeof b.name === "string" && b.name.trim() ? b.name : b.id,
      emoji: typeof b.emoji === "string" ? b.emoji : "",
      layer,
      percent:
        typeof b.percent === "number" && Number.isFinite(b.percent)
          ? b.percent
          : 0,
      ...(fixed !== undefined ? { fixed } : {}),
      mode,
      carryOver: b.carryOver === true,
      order:
        typeof b.order === "number" && Number.isFinite(b.order)
          ? b.order
          : index,
      ...(b.archived === true ? { archived: true } : {}),
    });
  });

  return out;
}

/**
 * The form a plan is saved in: trimmed text, and `order` renumbered 0..n so it
 * always matches the order the waterfall fills buckets in (archived last).
 */
export function finalizePlanBuckets(buckets: PlanBucket[]): PlanBucket[] {
  const ordered = [
    ...sortBucketsByPlanOrder(activeBuckets(buckets)),
    ...sortBucketsByPlanOrder(archivedBuckets(buckets)),
  ];
  return ordered.map((b, order) => ({
    id: b.id,
    name: typeof b.name === "string" ? b.name.trim() : b.name,
    emoji: typeof b.emoji === "string" ? b.emoji.trim() : b.emoji,
    layer: b.layer,
    percent: b.percent,
    ...(b.fixed != null ? { fixed: b.fixed } : {}),
    mode: b.mode,
    carryOver: b.carryOver,
    order,
    ...(b.archived ? { archived: true } : {}),
  }));
}

/* ─── Validation ──────────────────────────────────────────────────── */

export type PlanBucketField =
  | "id"
  | "name"
  | "emoji"
  | "layer"
  | "mode"
  | "percent"
  | "fixed"
  | "carryOver"
  | "order";

export interface PlanIssue {
  level: "error" | "warning";
  /** Stable machine-readable reason (tests and the editor key off this) */
  code: string;
  /** Plain-language explanation shown to the user */
  message: string;
  bucketId?: string;
  field?: PlanBucketField;
}

export interface PlanValidation {
  /** false when any error exists: the plan must not be saved */
  ok: boolean;
  errors: string[];
  warnings: string[];
  issues: PlanIssue[];
}

function percentText(n: number): string {
  return String(Number(n.toFixed(2)));
}

/**
 * Decide whether a plan may be saved.
 *
 * Errors mean the plan is not saved. They cover the plan's shape (every bucket
 * has a valid id, name and layer), its numbers (percent 0–100, fixed amount not
 * negative) and the waterfall's own rules:
 *   - Mandatory percentages can not add up to more than 100% of income.
 *   - Life plan percentages must add up to exactly 100%, and at least one must
 *     exist, so every unit of income lands in a bucket.
 *   - A percentage-split bucket can not also carry a fixed amount (the engine
 *     would silently ignore the fixed amount).
 * Archived buckets take no income, so only their identity is checked.
 */
export function validatePlan(
  plan: Pick<BudgetPlan, "buckets" | "name">
): PlanValidation {
  const issues: PlanIssue[] = [];
  const add = (
    level: PlanIssue["level"],
    code: string,
    message: string,
    bucket?: { id?: unknown },
    field?: PlanBucketField
  ) => {
    issues.push({
      level,
      code,
      message,
      ...(bucket && typeof bucket.id === "string"
        ? { bucketId: bucket.id }
        : {}),
      ...(field ? { field } : {}),
    });
  };
  const err = (
    code: string,
    message: string,
    bucket?: { id?: unknown },
    field?: PlanBucketField
  ) => add("error", code, message, bucket, field);

  const name = typeof plan.name === "string" ? plan.name.trim() : "";
  if (!name) {
    err("plan_name_missing", "Give your plan a name.");
  } else if (name.length > MAX_PLAN_NAME_LENGTH) {
    err(
      "plan_name_too_long",
      `Keep the plan name to ${MAX_PLAN_NAME_LENGTH} characters or fewer.`
    );
  }

  const buckets: PlanBucket[] = Array.isArray(plan.buckets)
    ? plan.buckets.filter((b) => b && typeof b === "object")
    : [];
  const active = activeBuckets(buckets);

  if (active.length === 0) {
    err("no_buckets", "Add at least one bucket.");
  }
  if (active.length > MAX_ACTIVE_BUCKETS) {
    err(
      "too_many_buckets",
      `A plan can have up to ${MAX_ACTIVE_BUCKETS} active buckets.`
    );
  }
  if (buckets.length > MAX_TOTAL_BUCKETS) {
    err(
      "too_many_buckets",
      `A plan can hold up to ${MAX_TOTAL_BUCKETS} buckets including archived ones.`
    );
  }

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  /**
   * Active buckets whose allocation rule is sound. The cross-bucket totals
   * below are added up from these, so a bucket with (say) a missing name still
   * counts towards "Life plan adds up to 100%".
   */
  const ruleSound: PlanBucket[] = [];

  for (const bucket of buckets) {
    const label =
      typeof bucket.name === "string" && bucket.name.trim()
        ? bucket.name.trim()
        : "A bucket";
    let ruleOk = true;
    const bad = (code: string, message: string, field?: PlanBucketField) => {
      if (
        field === "layer" ||
        field === "mode" ||
        field === "percent" ||
        field === "fixed"
      ) {
        ruleOk = false;
      }
      err(code, message, bucket, field);
    };

    // Identity
    if (!isValidBucketId(bucket.id)) {
      bad("bucket_id_invalid", `${label} has an id that can not be used.`, "id");
    } else if (seenIds.has(bucket.id)) {
      bad(
        "bucket_id_duplicate",
        `Two buckets share the id “${bucket.id}”. Every bucket needs its own.`,
        "id"
      );
    } else {
      seenIds.add(bucket.id);
    }

    if (typeof bucket.name !== "string" || !bucket.name.trim()) {
      bad("bucket_name_missing", "Every bucket needs a name.", "name");
    } else if (bucket.name.trim().length > MAX_BUCKET_NAME_LENGTH) {
      bad(
        "bucket_name_too_long",
        `${label}: keep the name to ${MAX_BUCKET_NAME_LENGTH} characters or fewer.`,
        "name"
      );
    } else if (!bucket.archived) {
      const key = bucket.name.trim().toLowerCase();
      if (seenNames.has(key)) {
        bad(
          "bucket_name_duplicate",
          `Two buckets are called “${label}”. Give each bucket its own name.`,
          "name"
        );
      }
      seenNames.add(key);
    }

    if (
      typeof bucket.emoji !== "string" ||
      bucket.emoji.length > MAX_BUCKET_EMOJI_LENGTH
    ) {
      bad("bucket_emoji_invalid", `${label}: use a single emoji.`, "emoji");
    }

    // Shape
    const layerOk = WATERFALL_LAYERS.includes(bucket.layer);
    if (!layerOk) {
      bad(
        "bucket_layer_invalid",
        `${label} needs a layer: Mandatory, Off the top, or Life plan.`,
        "layer"
      );
    }
    const modeOk = ALLOCATION_MODES.includes(bucket.mode);
    if (!modeOk) {
      bad("bucket_mode_invalid", `${label} has no valid allocation rule.`, "mode");
    }
    if (typeof bucket.carryOver !== "boolean") {
      bad(
        "bucket_carryover_invalid",
        `${label}: choose whether leftover money carries over.`,
        "carryOver"
      );
    }
    if (typeof bucket.order !== "number" || !Number.isFinite(bucket.order)) {
      bad("bucket_order_invalid", `${label} has no valid position.`, "order");
    }

    // Numbers
    const percentOk =
      typeof bucket.percent === "number" &&
      Number.isFinite(bucket.percent) &&
      bucket.percent >= 0 &&
      bucket.percent <= 100;
    if (!percentOk) {
      bad(
        "bucket_percent_out_of_range",
        `${label}: the percentage must be between 0 and 100.`,
        "percent"
      );
    }
    const fixed = hasFixedAmount(bucket);
    const fixedOk =
      !fixed ||
      (typeof bucket.fixed === "number" &&
        Number.isFinite(bucket.fixed) &&
        bucket.fixed >= 0);
    if (!fixedOk) {
      bad(
        "bucket_fixed_invalid",
        `${label}: the fixed amount must be a number and can not be negative.`,
        "fixed"
      );
    }

    // Archived buckets take no income, so allocation rules do not apply.
    if (bucket.archived) continue;

    // Layer and allocation rule must agree
    if (layerOk && modeOk) {
      if (bucket.mode === "share_remainder" && fixed) {
        bad(
          "bucket_fixed_on_share",
          `${label}: choose either a percentage or a fixed amount, not both.`,
          "fixed"
        );
      } else if (bucket.mode !== allocationModeFor(bucket.layer, fixed)) {
        const expects =
          bucket.layer === "mandatory"
            ? "A Mandatory bucket takes a percentage of your total income, or a fixed amount."
            : bucket.layer === "off_the_top"
              ? "An Off the top bucket takes a percentage of what is left, or a fixed amount."
              : "A Life plan bucket takes a percentage of what is left, or a fixed amount.";
        bad("bucket_mode_mismatch", `${label}: ${expects}`, "mode");
      }
    }

    // An active bucket has to receive something
    if (fixed) {
      if (fixedOk && !((bucket.fixed as number) > 0)) {
        bad(
          "bucket_no_allocation",
          `${label}: enter a fixed amount above 0, or archive the bucket.`,
          "fixed"
        );
      }
    } else if (percentOk && !(bucket.percent > 0)) {
      bad(
        "bucket_no_allocation",
        `${label}: enter a percentage above 0, or archive the bucket.`,
        "percent"
      );
    }

    if (ruleOk) ruleSound.push(bucket);
  }

  // Cross-bucket rules
  const inLayer = (layer: WaterfallLayer) =>
    ruleSound.filter((b) => b.layer === layer);
  const percentOnly = (list: PlanBucket[]) =>
    list.filter((b) => !hasFixedAmount(b));
  const sum = (list: PlanBucket[]) =>
    list.reduce((total, b) => total + b.percent, 0);

  const mandatoryPercent = sum(percentOnly(inLayer("mandatory")));
  if (mandatoryPercent > 100 + PERCENT_TOLERANCE) {
    err(
      "mandatory_over_100",
      `Mandatory buckets take ${percentText(mandatoryPercent)}% of your income between them. That can not be more than 100%.`
    );
  }

  const lifePlanShares = percentOnly(inLayer("life_plan"));
  // A Life plan percentage bucket that exists but has its own error (0%, say)
  // is already reported on that bucket; do not also call the life plan missing.
  const lifePlanShareExists = active.some(
    (b) => b.layer === "life_plan" && !hasFixedAmount(b)
  );
  if (active.length > 0 && !lifePlanShareExists) {
    err(
      "life_plan_missing",
      "Add at least one Life plan bucket with a percentage. It receives whatever is left, so all of your income lands in a bucket."
    );
  } else if (lifePlanShares.length > 0) {
    const shareTotal = sum(lifePlanShares);
    if (Math.abs(shareTotal - 100) > PERCENT_TOLERANCE) {
      err(
        "life_plan_not_100",
        `Life plan percentages add up to ${percentText(shareTotal)}%. They need to add up to exactly 100%.`
      );
    }
  }

  // Warnings: valid, but probably not what the user meant
  const hasLaterBuckets = (layer: WaterfallLayer) =>
    active.some(
      (b) =>
        WATERFALL_LAYERS.indexOf(b.layer) > WATERFALL_LAYERS.indexOf(layer)
    );
  if (
    Math.abs(mandatoryPercent - 100) <= PERCENT_TOLERANCE &&
    hasLaterBuckets("mandatory")
  ) {
    add(
      "warning",
      "mandatory_takes_all",
      "Mandatory buckets take all of your income, so nothing reaches the buckets after them."
    );
  }
  for (const bucket of percentOnly(inLayer("off_the_top"))) {
    if (bucket.percent >= 100 - PERCENT_TOLERANCE) {
      add(
        "warning",
        "off_the_top_takes_all",
        `${String(bucket.name).trim()} takes everything that is left, so nothing reaches the buckets after it.`,
        bucket,
        "percent"
      );
    }
  }

  const messages = (level: PlanIssue["level"]) => [
    ...new Set(issues.filter((i) => i.level === level).map((i) => i.message)),
  ];
  const errors = messages("error");
  return {
    ok: errors.length === 0,
    errors,
    warnings: messages("warning"),
    issues,
  };
}

/* ─── Plan changes ────────────────────────────────────────────────── */

/**
 * The parts of a plan that decide how income is split and carried over.
 *
 * Names and emoji are not rules. Neither is the display order of the
 * percentage-split buckets: they share one pot whatever order they are in.
 * The order of fixed / sequential buckets IS a rule, because each one takes
 * from what the one before it left behind.
 */
function ruleSignature(plan: Pick<BudgetPlan, "buckets"> | null): string {
  if (!plan) return "";
  const active = activeBuckets(plan.buckets);
  const rule = (b: PlanBucket) => [
    b.id,
    b.mode,
    hasFixedAmount(b) ? ["fixed", b.fixed] : ["percent", b.percent],
    b.carryOver,
  ];
  const parts = WATERFALL_LAYERS.map((layer) => {
    const inLayer = active
      .filter((b) => bucketLayer(b) === layer)
      .sort((a, b) => a.order - b.order);
    const sequential = inLayer
      .filter((b) => b.mode !== "share_remainder")
      .map(rule);
    const shares = inLayer
      .filter((b) => b.mode === "share_remainder")
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(rule);
    return [layer, sequential, shares];
  });
  return JSON.stringify(parts);
}

/**
 * True when saving `after` in place of `before` changes how money is split or
 * carried over. Because history is rebuilt with the current plan, such a change
 * recalculates every past month. Renaming a bucket does not.
 */
export function planRulesChanged(
  before: Pick<BudgetPlan, "buckets"> | null,
  after: Pick<BudgetPlan, "buckets">
): boolean {
  return ruleSignature(before) !== ruleSignature(after);
}

/** How many transactions and recurring rules still point at each bucket id */
export type BucketUsage = Record<string, number>;

export function bucketUsageCount(usage: BucketUsage, bucketId: string): number {
  return Object.prototype.hasOwnProperty.call(usage, bucketId)
    ? usage[bucketId] || 0
    : 0;
}

/**
 * A bucket that history depends on may be archived, never removed.
 *
 * Removing it would leave past transactions pointing at nothing, and their
 * spending would silently drop out of view. Archiving keeps the identity.
 */
export function checkBucketRemovals(
  before: Pick<BudgetPlan, "buckets"> | null,
  after: Pick<BudgetPlan, "buckets">,
  usage: BucketUsage
): {
  ok: boolean;
  errors: string[];
  blocked: { bucketId: string; name: string; count: number }[];
} {
  const kept = new Set(after.buckets.map((b) => b.id));
  const blocked = (before?.buckets ?? [])
    .filter((b) => !kept.has(b.id))
    .map((b) => ({
      bucketId: b.id,
      name: b.name,
      count: bucketUsageCount(usage, b.id),
    }))
    .filter((b) => b.count > 0);

  return {
    ok: blocked.length === 0,
    blocked,
    errors: blocked.map(
      (b) =>
        `${b.name} is used by ${b.count} ${
          b.count === 1 ? "transaction" : "transactions"
        }. Archive it instead of removing it, so that history keeps its bucket.`
    ),
  };
}

/**
 * Start a draft plan from a template.
 *
 * A template is only a starting point: nothing is saved here. Every existing
 * bucket that history depends on, and that the template does not contain, is
 * kept as an archived bucket so its transactions keep their name. A bucket with
 * the same id as a template bucket simply continues as that bucket.
 */
export function draftFromTemplate(
  template: PlanTemplate,
  current: Pick<BudgetPlan, "buckets"> | null,
  usage: BucketUsage
): { name: string; templateId: string; buckets: PlanBucket[] } {
  const buckets: PlanBucket[] = template.plan.buckets.map((b) => ({ ...b }));
  const inTemplate = new Set(buckets.map((b) => b.id));

  for (const bucket of current?.buckets ?? []) {
    if (inTemplate.has(bucket.id)) continue;
    if (bucketUsageCount(usage, bucket.id) === 0) continue;
    buckets.push({ ...bucket, archived: true });
  }

  return {
    name: template.plan.name,
    templateId: template.id,
    buckets: finalizePlanBuckets(buckets),
  };
}

/* ─── Plain language ──────────────────────────────────────────────── */

/** One line that says what a bucket receives, without engine vocabulary. */
export function bucketRuleLabel(
  bucket: PlanBucket,
  currency: CurrencyCode
): string {
  if (bucket.archived) return "Archived: receives no new income";
  if (hasFixedAmount(bucket)) {
    return `${formatMoney(bucket.fixed as number, currency)} fixed each month`;
  }
  const percent = `${percentText(bucket.percent)}%`;
  const layer = bucketLayer(bucket);
  if (layer === "mandatory") return `${percent} of your total income`;
  if (layer === "off_the_top") return `${percent} of what is left after Mandatory`;
  return `${percent} of what is left for your life plan`;
}

/** Plain-English text for the per-bucket carry-over switch */
export function carryOverCopy(enabled: boolean): {
  title: string;
  body: string;
  example: string;
} {
  if (enabled) {
    return {
      title: "Carries over",
      body: "Money left in this bucket at month end stays there and is added to next month.",
      example:
        "Example: you allocated ₦90,000 and spent ₦10,000. Next month starts with ₦80,000 already in the bucket, plus that month’s new allocation.",
    };
  }
  return {
    title: "Resets each month",
    body: "The bucket starts from zero every month. Money left at month end does not roll forward.",
    example:
      "Example: you allocated ₦90,000 and spent ₦10,000. Next month the bucket holds only that month’s new allocation.",
  };
}

/**
 * What changes between two versions of a plan, one plain sentence per change.
 * Shown to the user before they confirm a plan change.
 */
export function describePlanChanges(
  before: Pick<BudgetPlan, "buckets"> | null,
  after: Pick<BudgetPlan, "buckets">,
  currency: CurrencyCode
): string[] {
  const out: string[] = [];
  const beforeById = new Map((before?.buckets ?? []).map((b) => [b.id, b]));
  const afterIds = new Set(after.buckets.map((b) => b.id));
  const title = (b: PlanBucket) => `${b.emoji ? `${b.emoji} ` : ""}${b.name}`;

  for (const next of sortBucketsByPlanOrder(after.buckets)) {
    const prev = beforeById.get(next.id);
    if (!prev) {
      if (!next.archived) {
        out.push(`New bucket: ${title(next)} (${bucketRuleLabel(next, currency)}).`);
      }
      continue;
    }
    if (!prev.archived && next.archived) {
      out.push(
        `${title(next)} is archived. It stops receiving income; its past transactions are kept.`
      );
      continue;
    }
    if (prev.archived && !next.archived) {
      out.push(
        `${title(next)} is restored (${bucketRuleLabel(next, currency)}).`
      );
      continue;
    }
    if (next.archived) continue;

    if (prev.name !== next.name) {
      out.push(`${title(prev)} is renamed to ${title(next)}.`);
    }
    const prevRule = bucketRuleLabel(prev, currency);
    const nextRule = bucketRuleLabel(next, currency);
    if (prevRule !== nextRule) {
      out.push(`${title(next)}: ${prevRule} becomes ${nextRule}.`);
    }
    if (prev.carryOver !== next.carryOver) {
      out.push(
        next.carryOver
          ? `${title(next)} now carries leftover money into the next month.`
          : `${title(next)} now resets each month instead of carrying over.`
      );
    }
  }

  for (const prev of before?.buckets ?? []) {
    if (!afterIds.has(prev.id)) out.push(`${title(prev)} is removed.`);
  }

  if (
    out.length === 0 &&
    before &&
    planRulesChanged(before, after)
  ) {
    out.push("The order your buckets are filled in changes.");
  }
  return out;
}
