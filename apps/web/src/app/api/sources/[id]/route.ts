/**
 * PATCH  /api/sources/:id — update expected amount / name / currency
 * DELETE /api/sources/:id — remove source (zero sources is a valid state)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  emoji: z.string().optional(),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]).optional(),
  amount: z.number().min(0).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const body = patchSchema.parse(await req.json());
    const existing = await prisma.incomeSource.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const source = await prisma.incomeSource.update({
      where: { id },
      data: body,
    });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await prisma.incomeSource.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  await prisma.incomeSource.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
