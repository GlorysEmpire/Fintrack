/**
 * WATERFALL ENGINE — the heart of FinTrack money math.
 *
 * A waterfall has three core layers:
 *  1. mandatory   — obligations that come first
 *  2. off_the_top — allocations removed before the life plan
 *  3. life_plan   — user's actual financial-life split
 *
 * New buckets explicitly declare their layer.
 * Legacy buckets can still derive their layer from mode
 * while existing plans are being migrated.
 *
 * Whether a plan may be saved at all is decided in plan.ts (validatePlan).
 */

import type {
  BudgetPlan,
  PlanBucket,
  WaterfallLayer,
  WaterfallLine,
  WaterfallResult,
} from "./types";

/** The order the layers are filled in. */
export const WATERFALL_LAYERS: readonly WaterfallLayer[] = [
  "mandatory",
  "off_the_top",
  "life_plan",
];

/**
 * The layer a bucket belongs to.
 *
 * New buckets explicitly declare their layer.
 *
 * Legacy buckets do not have a layer yet, so we derive
 * their layer from their existing mode.
 */
export function bucketLayer(
  bucket: Pick<PlanBucket, "layer" | "mode">
): WaterfallLayer {
  if (bucket.layer) {
    return bucket.layer;
  }

  if (bucket.mode === "of_gross") {
    return "mandatory";
  }

  if (bucket.mode === "of_remaining") {
    return "off_the_top";
  }

  return "life_plan";
}

export function allocateWaterfall(
  gross: number,
  plan: Pick<BudgetPlan, "buckets">
): WaterfallResult {
  if (!Number.isFinite(gross) || gross < 0) {
    return {
      gross: 0,
      lines: [],
      allocatedTotal: 0,
      unallocated: 0,
    };
  }

  /*
   * Archived buckets keep their identity for history,
   * but they no longer receive income.
   */
  const buckets = plan.buckets
    .filter((bucket) => !bucket.archived)
    .sort((a, b) => a.order - b.order);

  let remaining = gross;
  const lines: WaterfallLine[] = [];

  /*
   * Process the waterfall in its defined layer order.
   */
  for (const layer of WATERFALL_LAYERS) {
    const layerBuckets = buckets.filter(
      (bucket) => bucketLayer(bucket) === layer
    );

    if (!layerBuckets.length) {
      continue;
    }

    /*
     * Sequential buckets consume the remaining balance one
     * after another.
     *
     * This handles:
     * - of_gross
     * - of_remaining
     * - fixed allocations
     */
    const sequentialBuckets =
      layerBuckets.filter(
        (bucket) =>
          bucket.mode !== "share_remainder"
      );

    /*
     * Share-remainder buckets divide the same remaining pot.
     *
     * This is primarily used by the life-plan layer.
     */
    const shareBuckets =
      layerBuckets.filter(
        (bucket) =>
          bucket.mode === "share_remainder"
      );

    /*
     * Process sequential allocations first.
     */
    for (const bucket of sequentialBuckets) {
      const allocated = amountSequential(
        gross,
        remaining,
        bucket
      );

      remaining = Math.max(
        0,
        remaining - allocated
      );

      lines.push(
        toLine(
          bucket,
          allocated,
          gross
        )
      );
    }

    /*
     * Divide the remaining balance among share-remainder
     * buckets according to their percentage weights.
     *
     * Example:
     *
     * Remaining = 80,000
     *
     * Needs   = 50
     * Wants   = 20
     * Savings = 30
     *
     * Total = 100
     *
     * Needs   = 40,000
     * Wants   = 16,000
     * Savings = 24,000
     */
    if (shareBuckets.length) {
      const weightSum =
        shareBuckets.reduce(
          (sum, bucket) =>
            sum +
            Math.max(
              0,
              bucket.percent
            ),
          0
        );

      const pot = remaining;

      for (const bucket of shareBuckets) {
        const allocated =
          weightSum > 0
            ? pot *
              (
                Math.max(
                  0,
                  bucket.percent
                ) /
                weightSum
              )
            : 0;

        lines.push(
          toLine(
            bucket,
            allocated,
            gross
          )
        );
      }

      /*
       * The entire remaining pot has now been distributed.
       */
      remaining = 0;
    }
  }

  const allocatedTotal =
    lines.reduce(
      (sum, line) =>
        sum + line.allocated,
      0
    );

  return {
    gross,
    lines,
    allocatedTotal,
    unallocated: Math.max(
      0,
      gross - allocatedTotal
    ),
  };
}

/**
 * Calculate the allocation for a sequential bucket.
 *
 * Fixed amounts take priority over percentages.
 *
 * If there is no fixed amount:
 *
 * - of_gross      → percentage of original income
 * - of_remaining  → percentage of remaining income
 */
function amountSequential(
  gross: number,
  remaining: number,
  bucket: PlanBucket
): number {
  /*
   * Fixed allocation.
   *
   * Example:
   * gross = 100,000
   * fixed = 10,000
   *
   * allocation = 10,000
   */
  if (bucket.fixed != null) {
    return Math.min(
      Math.max(
        0,
        bucket.fixed
      ),
      remaining
    );
  }

  const percent =
    Math.max(
      0,
      Math.min(
        100,
        bucket.percent
      )
    ) / 100;

  /*
   * Percentage of original gross income.
   *
   * Never more than what is still left: a plan can not hand
   * out money that did not come in. This only bites when
   * fixed amounts earlier in the order have already used
   * most of a small income.
   */
  if (bucket.mode === "of_gross") {
    return Math.min(gross * percent, remaining);
  }

  /*
   * Percentage of whatever remains.
   */
  return remaining * percent;
}

function toLine(
  bucket: PlanBucket,
  allocated: number,
  gross: number
): WaterfallLine {
  return {
    bucketId: bucket.id,
    name: bucket.name,
    emoji: bucket.emoji,
    allocated,
    percentOfGross:
      gross > 0
        ? (allocated / gross) * 100
        : 0,
    mode: bucket.mode,
    carryOver: bucket.carryOver,
  };
}
