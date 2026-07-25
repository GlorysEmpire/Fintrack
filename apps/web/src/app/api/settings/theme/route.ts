/**
 * PATCH /api/settings/theme — persist system | light | dark on User.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  theme: z.enum(["system", "light", "dark"]),
});

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = schema.parse(await req.json());
    await prisma.user.update({
      where: { id: user.id },
      data: { theme: body.theme },
    });
    return NextResponse.json({ ok: true, theme: body.theme });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
