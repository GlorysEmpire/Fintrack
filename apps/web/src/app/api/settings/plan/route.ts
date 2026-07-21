import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import {
  getUserPlan,
  saveCustomPlan,
  savePlanFromTemplate,
  setEmergencyCarryOver,
} from "@/lib/plan";
import { validatePlan, type PlanBucket } from "@fintrack/domain";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const plan = await getUserPlan(user.id);
  return NextResponse.json({
    ok: true,
    plan,
    onboarding: user.onboarding,
    baseCurrency: user.baseCurrency,
  });
}

const patchSchema = z.object({
  emergencyCarryOver: z.boolean().optional(),
  templateId: z.string().optional(),
  name: z.string().optional(),
  buckets: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        emoji: z.string(),
        percent: z.number(),
        mode: z.enum(["of_gross", "of_remaining", "share_remainder"]),
        carryOver: z.boolean(),
        order: z.number(),
      })
    )
    .optional(),
});

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = patchSchema.parse(await req.json());

    if (body.templateId) {
      await savePlanFromTemplate(user.id, body.templateId);
      if (user.onboarding === "skipped" || user.onboarding === "pending") {
        await prisma.user.update({
          where: { id: user.id },
          data: { onboarding: "completed" },
        });
      }
    }

    if (body.buckets && body.name) {
      const buckets = body.buckets as PlanBucket[];
      const check = validatePlan({ name: body.name, buckets });
      if (!check.ok) {
        return NextResponse.json(
          { ok: false, error: check.errors.join(" ") },
          { status: 400 }
        );
      }
      await saveCustomPlan(user.id, {
        name: body.name,
        buckets,
        emergencyCarryOverDefault: body.emergencyCarryOver,
      });
      if (user.onboarding !== "completed") {
        await prisma.user.update({
          where: { id: user.id },
          data: { onboarding: "completed" },
        });
      }
    } else if (typeof body.emergencyCarryOver === "boolean") {
      const row = await setEmergencyCarryOver(user.id, body.emergencyCarryOver);
      if (!row) {
        return NextResponse.json(
          {
            ok: false,
            error: "No plan yet. Choose a template or build a plan first.",
          },
          { status: 400 }
        );
      }
    }

    const plan = await getUserPlan(user.id);
    return NextResponse.json({ ok: true, plan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
