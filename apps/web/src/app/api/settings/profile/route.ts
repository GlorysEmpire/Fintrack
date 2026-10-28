/**
 * PATCH /api/settings/profile — set or clear the name FinTrack greets you with.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  // Empty clears it; whatever is kept is trimmed and never longer than a name needs to be
  name: z
    .string()
    .trim()
    .max(60, "A name can be up to 60 characters.")
    .transform((v) => (v === "" ? null : v)),
});

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { name } = schema.parse(await req.json());
    await prisma.user.update({ where: { id: user.id }, data: { name } });
    return NextResponse.json({ ok: true, name });
  } catch (e) {
    return routeError(e, "PATCH /api/settings/profile");
  }
}
