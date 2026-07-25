/**
 * GET/POST /api/public/cron/recurring
 * Expands due RecurringRule rows into Transaction rows.
 * Guarded by Authorization: Bearer ${CRON_SECRET} (or x-cron-secret).
 * Vercel Cron: daily 03:00 UTC.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Refuse when unset so the endpoint is never open by accident
    return false;
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured
  return false;
}

function advanceNextRun(
  from: Date,
  cadence: "daily" | "weekly" | "monthly",
  dayOfMonth: number | null
): Date {
  const d = new Date(from);
  if (cadence === "daily") {
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  if (cadence === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }
  // monthly
  const day = Math.min(Math.max(dayOfMonth || from.getUTCDate(), 1), 28);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(day);
  return d;
}

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.recurringRule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    take: 200,
  });

  let created = 0;
  for (const rule of due) {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          userId: rule.userId,
          type: rule.type === "i" ? "i" : "e",
          amount: rule.amount,
          currency: rule.currency,
          bucketId: rule.type === "e" ? rule.bucketId : null,
          sourceId: rule.type === "i" ? rule.sourceId : null,
          note: rule.note || "Recurring",
          recurringRuleId: rule.id,
          date: now,
        },
      });
      await tx.recurringRule.update({
        where: { id: rule.id },
        data: {
          nextRunAt: advanceNextRun(
            rule.nextRunAt,
            rule.cadence,
            rule.dayOfMonth
          ),
        },
      });
    });
    created += 1;
  }

  return NextResponse.json({
    ok: true,
    processed: due.length,
    created,
    at: now.toISOString(),
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
