/**
 * POST /api/ai/chat
 * Body: { message: string }
 * Returns Steward reply (xAI if keyed, else offline coach).
 * Persists last messages for continuity.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { filterMonthTxs, formatMoney, monthSnapshot, type CurrencyCode, type MoneyTx } from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { askSteward, buildUserContext, hasXaiKey } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { getUserPlan } from "@/lib/plan";
import { parseFx, parseOpeningBalances } from "@/lib/money";

const schema = z.object({
  message: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message } = schema.parse(await req.json());
    const plan = await getUserPlan(user.id);
    const planRow = await prisma.budgetPlan.findUnique({
      where: { userId: user.id },
    });
    const opening = planRow
      ? parseOpeningBalances(planRow.openingBalancesJson)
      : {};
    const fx = parseFx(user.fxRates);

    const [sources, allTxs, historyRows] = await Promise.all([
      prisma.incomeSource.findMany({ where: { userId: user.id } }),
      prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { date: "desc" },
        take: 200,
      }),
      prisma.aiMessage.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),
    ]);

    const moneyTxs: MoneyTx[] = allTxs.map((t) => ({
      type: t.type as "i" | "e",
      amount: t.amount,
      currency: t.currency,
      bucketId: t.bucketId,
      sourceId: t.sourceId,
      date: t.date,
    }));
    const month = filterMonthTxs(moneyTxs);
    const snap = monthSnapshot(plan, month, user.baseCurrency, fx, opening);
    const overrideCount = allTxs.filter((t) => t.override).length;
    const base = user.baseCurrency as CurrencyCode;

    const context = buildUserContext({
      email: user.email,
      baseCurrency: user.baseCurrency,
      plan,
      income: snap.income,
      expenses: snap.expenses,
      net: snap.net,
      buckets: snap.buckets,
      overrideCount,
      sourcesSummary: sources
        .map((s) => `${s.emoji} ${s.name} (${s.currency})`)
        .join("; "),
    });

    const history = historyRows.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const bucketLines = snap.buckets.map((b) => {
      const name =
        plan?.buckets.find((p) => p.id === b.bucketId)?.name || b.bucketId;
      return `${name}: left ${formatMoney(b.closing, base)} (spent ${formatMoney(b.spent, base)})`;
    });

    const { reply, mode } = await askSteward({
      userMessage: message,
      history,
      context,
      offlineCtx: {
        income: snap.income,
        expenses: snap.expenses,
        net: snap.net,
        planName: plan?.name || null,
        bucketLines,
        overrideCount,
      },
    });

    await prisma.aiMessage.createMany({
      data: [
        { userId: user.id, role: "user", content: message },
        { userId: user.id, role: "assistant", content: reply },
      ],
    });

    return NextResponse.json({
      ok: true,
      reply,
      mode,
      liveAi: hasXaiKey() && mode === "xai",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

/** GET recent chat history for the Advisor tab */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const messages = await prisma.aiMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  return NextResponse.json({
    ok: true,
    messages,
    liveAi: hasXaiKey(),
  });
}
