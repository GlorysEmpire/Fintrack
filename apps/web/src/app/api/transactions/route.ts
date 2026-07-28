/**
 * GET  /api/transactions — list recent transactions (optional ?month=1 for current month)
 * POST /api/transactions — log income or expense
 *
 * Expenses that exceed bucket remaining are hard-blocked.
 * Cross-bucket category spend requires note or reason text.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  amountInBase,
  expenseFriction,
  isCrossBucket,
  type MoneyTx,
} from "@fintrack/domain";
import { formatMoney, type CurrencyCode } from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOverrideInboxMessage } from "@/lib/inbox";
import { getUserPlan } from "@/lib/plan";
import { parseFx, parseOpeningBalances } from "@/lib/money";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const monthOnly = url.searchParams.get("month") === "1";

  const txs = await prisma.transaction.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 200,
  });

  if (!monthOnly) {
    return NextResponse.json({ ok: true, transactions: txs });
  }

  // Current calendar month (server local date boundary)
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const monthRows = txs.filter((t) => t.date >= start);
  return NextResponse.json({ ok: true, transactions: monthRows });
}

const postSchema = z.object({
  type: z.enum(["i", "e"]),
  amount: z.number().positive(),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]).default("NGN"),
  bucketId: z.string().optional().nullable(),
  sourceId: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  /** Client must set true when friction warns overspend / empty */
  confirmOverride: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = postSchema.parse(await req.json());
    const plan = await getUserPlan(user.id);
    const fx = parseFx(user.fxRates);
    const planRow = await prisma.budgetPlan.findUnique({
      where: { userId: user.id },
    });
    const opening = planRow
      ? parseOpeningBalances(planRow.openingBalancesJson)
      : {};

    // Income: optional source; no friction
    if (body.type === "i") {
      const tx = await prisma.transaction.create({
        data: {
          userId: user.id,
          type: "i",
          amount: body.amount,
          currency: body.currency,
          sourceId: body.sourceId || null,
          note: body.note || null,
        },
      });
      return NextResponse.json({ ok: true, transaction: tx });
    }

    // Expense: need a bucket when plan exists (still allow without plan)
    if (plan && !body.bucketId) {
      return NextResponse.json(
        { ok: false, error: "Pick a bucket for this expense." },
        { status: 400 }
      );
    }

    const monthRows = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    });
    const monthTxs: MoneyTx[] = monthRows.map((t) => ({
      type: t.type as "i" | "e",
      amount: t.amount,
      currency: t.currency,
      bucketId: t.bucketId,
      sourceId: t.sourceId,
      date: t.date,
    }));

    const amountBase = amountInBase(
      body.amount,
      body.currency,
      user.baseCurrency,
      fx
    );

    const friction = expenseFriction({
      amountBase,
      bucketId: body.bucketId || "spend",
      plan,
      monthTxs,
      base: user.baseCurrency,
      fx,
      openingBalances: opening,
    });

    // Hard block: never spend more than remaining in the chosen bucket
    if (plan && friction.blocked) {
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          friction,
          error: friction.message,
        },
        { status: 400 }
      );
    }

    const category = body.category || null;
    const note = (body.note || "").trim();
    const reason = (body.reason || "").trim();
    const cross =
      Boolean(body.bucketId && category) &&
      isCrossBucket(body.bucketId || "", category);

    if (cross && !note && !reason) {
      return NextResponse.json(
        {
          ok: false,
          crossBucket: true,
          error:
            "Cross-bucket spend blocked. Write a reason in the Note field, or choose a matching category.",
        },
        { status: 400 }
      );
    }

    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "e",
        amount: body.amount,
        currency: body.currency,
        bucketId: body.bucketId || null,
        category,
        note: note || null,
        reason: reason || (cross ? note : null),
        override: cross,
      },
    });

    // Accountability when intentionally spending from a non-matching category
    if (cross) {
      const bucketName =
        plan?.buckets.find((b) => b.id === body.bucketId)?.name ||
        body.bucketId ||
        "bucket";
      const base = user.baseCurrency as CurrencyCode;
      await createOverrideInboxMessage({
        userId: user.id,
        txId: tx.id,
        bucketName,
        amountLabel: formatMoney(body.amount, body.currency as CurrencyCode),
        reason: reason || note,
        remainingLabel: formatMoney(Math.max(0, friction.remaining), base),
      });
    }

    return NextResponse.json({
      ok: true,
      transaction: tx,
      friction,
      crossBucket: cross,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
