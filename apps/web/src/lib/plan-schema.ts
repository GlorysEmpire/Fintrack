/**
 * The ONE shape a plan has on the wire — used by onboarding and by Plan settings.
 *
 * This checks shape only (types, sane sizes). Whether the plan makes sense as a
 * waterfall is the domain's job (validatePlan), so there is a single set of
 * money rules and a single set of plain-language messages.
 *
 * The schemas are `.strict()`: a field they do not know is rejected out loud.
 * Before, unknown fields were dropped silently, which is how `layer` and
 * `fixed` used to disappear from custom plans on their way to the database.
 */
import { z } from "zod";
import type { PlanBucket } from "@fintrack/domain";

export const planBucketSchema = z
  .object({
    id: z.string().max(64),
    name: z.string().max(200),
    emoji: z.string().max(32),
    layer: z.enum(["mandatory", "off_the_top", "life_plan"]),
    percent: z.number().finite(),
    /** Omit (or null) for a percentage bucket */
    fixed: z.number().finite().nullable().optional(),
    mode: z.enum(["of_gross", "of_remaining", "share_remainder"]),
    carryOver: z.boolean(),
    order: z.number().finite(),
    archived: z.boolean().optional(),
  })
  .strict();

export const planFields = {
  name: z.string().max(200),
  buckets: z.array(planBucketSchema).max(200),
  /** Which template the plan started from, if any (a label, not a rule) */
  templateId: z.string().max(64).nullable().optional(),
};

export type PlanBucketInput = z.infer<typeof planBucketSchema>;

/** Wire shape → domain shape (`fixed: null` and `archived: false` mean "absent"). */
export function toPlanBuckets(input: PlanBucketInput[]): PlanBucket[] {
  return input.map((b) => ({
    id: b.id,
    name: b.name,
    emoji: b.emoji,
    layer: b.layer,
    percent: b.percent,
    ...(b.fixed != null ? { fixed: b.fixed } : {}),
    mode: b.mode,
    carryOver: b.carryOver,
    order: b.order,
    ...(b.archived ? { archived: true } : {}),
  }));
}
