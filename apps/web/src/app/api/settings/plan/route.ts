/**
 * GET   /api/settings/plan — the user's saved plan
 * PATCH /api/settings/plan — save the plan built in the plan editor
 *
 * PATCH body: { name, buckets[], templateId?, confirmHistoryChange? }
 *
 *   400  the plan is not valid (it is not saved), or it would remove a bucket
 *        that history depends on (archive it instead)
 *   409  the change recalculates past months and has not been confirmed yet.
 *        Nothing is saved; the response carries the before/after to show the
 *        user. Send the same body with confirmHistoryChange: true to apply it.
 *   200  saved
 *
 * There is deliberately no shortcut here that swaps the plan for a template or
 * flips one bucket's carry-over: every plan change comes through this one door.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { getUserPlan } from "@/lib/plan";
import { planFields, toPlanBuckets } from "@/lib/plan-schema";
import { proposePlanChange } from "@/lib/plan-service";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const plan = await getUserPlan(user.id);
  return NextResponse.json({
    ok: true,
    plan,
    onboarding: user.onboarding,
    baseCurrency: user.baseCurrency,
  });
}

const patchSchema = z
  .object({
    ...planFields,
    /** Sent only after the user has seen what the change does to past months */
    confirmHistoryChange: z.boolean().optional().default(false),
  })
  .strict();

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const body = patchSchema.parse(await req.json());
    const result = await proposePlanChange(user, {
      name: body.name,
      buckets: toPlanBuckets(body.buckets),
      templateId: body.templateId ?? null,
      confirmHistoryChange: body.confirmHistoryChange,
    });

    if (result.status === "invalid") {
      return jsonError(400, result.errors.join(" "), {
        errors: result.errors,
        issues: result.issues,
      });
    }
    if (result.status === "needs_confirmation") {
      return jsonError(
        409,
        "This change recalculates your past months. Review what changes, then confirm.",
        {
          needsConfirmation: true,
          kind: "plan_change",
          impact: result.impact,
          warnings: result.warnings,
        }
      );
    }
    return NextResponse.json({
      ok: true,
      plan: result.plan,
      warnings: result.warnings,
    });
  } catch (e) {
    return routeError(e, "PATCH /api/settings/plan");
  }
}
