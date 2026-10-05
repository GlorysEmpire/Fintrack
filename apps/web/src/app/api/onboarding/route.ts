/**
 * POST /api/onboarding
 * Completes first-launch setup for the logged-in user.
 *
 * path: "default" | "template" | "custom" | "skip"
 * Optional income sources (user-chosen only — never auto-seeded):
 *   presetIds?: string[]  — GENERIC_INCOME_PRESETS ids
 *   customSources?: { name, type?, emoji?, currency?, amount? }[]
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserPlan, savePlanFromTemplate, writePlan } from "@/lib/plan";
import { planFields, toPlanBuckets } from "@/lib/plan-schema";
import { finalizePlanBuckets, getTemplate, validatePlan } from "@fintrack/domain";
import {
  createIncomeSourcesForUser,
  resolveIncomeSourceInputs,
} from "@/lib/money";

const customSourceSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.string().max(40).optional(),
  emoji: z.string().max(8).optional(),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]).optional(),
  amount: z.number().min(0).optional(),
});

const sourcesFields = {
  presetIds: z.array(z.string()).optional(),
  customSources: z.array(customSourceSchema).optional(),
};

const schema = z.discriminatedUnion("path", [
  z.object({
    path: z.literal("default"),
    templateId: z.string().default("tithe_first"),
    ...sourcesFields,
  }),
  z.object({
    path: z.literal("skip"),
    ...sourcesFields,
  }),
  // Same plan shape as Plan settings (keeps `layer`, `fixed`, `archived`)
  z
    .object({
      path: z.literal("custom"),
      ...planFields,
      ...sourcesFields,
    })
    .strict(),
  z.object({
    path: z.literal("template"),
    templateId: z.string(),
    ...sourcesFields,
  }),
]);

async function applySources(
  userId: string,
  body: {
    presetIds?: string[];
    customSources?: z.infer<typeof customSourceSchema>[];
  }
) {
  const inputs = resolveIncomeSourceInputs({
    presetIds: body.presetIds,
    custom: (body.customSources ?? []).map((c) => ({
      name: c.name,
      type: c.type || "other",
      emoji: c.emoji || "💵",
      currency: c.currency || "NGN",
      amount: c.amount ?? 0,
    })),
  });
  return createIncomeSourcesForUser(userId, inputs);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const body = schema.parse(await req.json());

    // Onboarding creates a FIRST plan. It must never be a side door that
    // replaces an existing plan without the confirmation Plan settings asks for.
    if (body.path !== "skip" && (await getUserPlan(user.id))) {
      return jsonError(
        409,
        "You already have a plan. Change it in Plan settings, where you can see what a change does to your history first."
      );
    }

    // Skip: no plan created — user can set one later in Settings
    if (body.path === "skip") {
      await applySources(user.id, body);
      await prisma.user.update({
        where: { id: user.id },
        data: { onboarding: "skipped" },
      });
      return NextResponse.json({ ok: true, onboarding: "skipped" });
    }

    if (body.path === "default" || body.path === "template") {
      const templateId =
        body.path === "default"
          ? body.templateId || "tithe_first"
          : body.templateId;
      if (!getTemplate(templateId)) {
        return jsonError(400, "Unknown template.");
      }
      await savePlanFromTemplate(user.id, templateId);
      await applySources(user.id, body);
      await prisma.user.update({
        where: { id: user.id },
        data: { onboarding: "completed" },
      });
      return NextResponse.json({ ok: true, onboarding: "completed" });
    }

    // Custom plan built in the plan editor
    const name = body.name.trim();
    const buckets = finalizePlanBuckets(toPlanBuckets(body.buckets));
    const check = validatePlan({ name, buckets });
    if (!check.ok) {
      return jsonError(400, check.errors.join(" "), {
        errors: check.errors,
        issues: check.issues.filter((i) => i.level === "error"),
        warnings: check.warnings,
      });
    }

    await writePlan(user.id, {
      name,
      templateId:
        body.templateId && getTemplate(body.templateId) ? body.templateId : null,
      buckets,
    });
    await applySources(user.id, body);
    await prisma.user.update({
      where: { id: user.id },
      data: { onboarding: "completed" },
    });
    return NextResponse.json({
      ok: true,
      onboarding: "completed",
      warnings: check.warnings,
    });
  } catch (e) {
    return routeError(e, "POST /api/onboarding");
  }
}
