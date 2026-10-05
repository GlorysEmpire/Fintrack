/**
 * GET  /api/transactions — list recent transactions (optional ?month=1 for current month)
 * POST /api/transactions — log income or expense
 *
 * An expense over its bucket's balance is never refused: the first POST comes
 * back 409 with the explanation, and the same request with
 * confirmOverspend: true saves it. Cross-bucket category spend requires note
 * or reason text. Optional `date` ("YYYY-MM-DD") files it under an earlier day.
 */
import { NextResponse } from "next/server";
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createTransaction } from "@/lib/transactions";
import { createTransactionSchema, transactionResponse } from "./shared";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const monthOnly = url.searchParams.get("month") === "1";

  const txs = await prisma.transaction.findMany({
    where: { userId: user.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
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

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const body = createTransactionSchema.parse(await req.json());
    return transactionResponse(await createTransaction(user, body));
  } catch (e) {
    return routeError(e, "POST /api/transactions");
  }
}
