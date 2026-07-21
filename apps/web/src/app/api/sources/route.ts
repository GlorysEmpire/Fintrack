/**
 * GET  /api/sources  — list income sources (seeds defaults if empty)
 * POST /api/sources  — add a source
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureDefaultSources } from "@/lib/money";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  await ensureDefaultSources(user.id);
  const sources = await prisma.incomeSource.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ ok: true, sources });
}

const createSchema = z.object({
  name: z.string().min(1),
  type: z.string().default("other"),
  emoji: z.string().default("💵"),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]).default("NGN"),
  amount: z.number().min(0).default(0),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = createSchema.parse(await req.json());
    const source = await prisma.incomeSource.create({
      data: { userId: user.id, ...body },
    });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
