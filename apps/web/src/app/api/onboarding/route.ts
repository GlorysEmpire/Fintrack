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
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveCustomPlan, savePlanFromTemplate } from "@/lib/plan";
import type { PlanBucket } from "@fintrack/domain";
import { validatePlan } from "@fintrack/domain";
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
  z.object({
    path: z.literal("custom"),
    name: z.string().min(1),
    buckets: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        emoji: z.string(),
        percent: z.number(),
        mode: z.enum(["of_gross", "of_remaining", "share_remainder"]),
        carryOver: z.boolean(),
        order: z.number(),
      })
    ),
    emergencyCarryOverDefault: z.boolean().optional(),
    ...sourcesFields,
  }),
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
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await req.json());

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
      await savePlanFromTemplate(user.id, templateId);
      await applySources(user.id, body);
      await prisma.user.update({
        where: { id: user.id },
        data: { onboarding: "completed" },
      });
      return NextResponse.json({ ok: true, onboarding: "completed" });
    }

    // Custom plan from API (future visual builder will call this)
    const buckets = body.buckets as PlanBucket[];
    const check = validatePlan({ name: body.name, buckets });
    if (!check.ok) {
      return NextResponse.json(
        { ok: false, error: check.errors.join(" "), warnings: check.warnings },
        { status: 400 }
      );
    }

    await saveCustomPlan(user.id, {
      name: body.name,
      buckets,
      emergencyCarryOverDefault: body.emergencyCarryOverDefault ?? true,
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
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
