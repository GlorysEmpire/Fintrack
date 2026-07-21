/**
 * POST /api/onboarding
 * Completes first-launch setup for the logged-in user.
 *
 * path: "default" | "template" | "custom" | "skip"
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveCustomPlan, savePlanFromTemplate } from "@/lib/plan";
import type { PlanBucket } from "@fintrack/domain";
import { validatePlan } from "@fintrack/domain";

const schema = z.discriminatedUnion("path", [
  z.object({
    path: z.literal("default"),
    templateId: z.string().default("tithe_first"),
  }),
  z.object({ path: z.literal("skip") }),
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
  }),
  z.object({
    path: z.literal("template"),
    templateId: z.string(),
  }),
]);

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await req.json());

    // Skip: no plan created — user can set one later in Settings
    if (body.path === "skip") {
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
