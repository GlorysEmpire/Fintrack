/**
 * PATCH /api/settings/currency — switch base currency (top-bar select).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  baseCurrency: z.enum(["NGN", "USD", "GBP", "EUR"]),
});

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { baseCurrency } = schema.parse(await req.json());
    await prisma.user.update({
      where: { id: user.id },
      data: { baseCurrency },
    });
    return NextResponse.json({ ok: true, baseCurrency });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
