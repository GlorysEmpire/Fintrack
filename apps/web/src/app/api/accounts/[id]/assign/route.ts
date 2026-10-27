/**
 * POST /api/accounts/[id]/assign — body { confirm: true }
 * Put every unassigned transaction in this account's currency, dated on or
 * after its opening date, into this account. Deliberate and confirmed; only
 * the account is set.
 */
import { NextResponse } from "next/server";
import { jsonError, routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { assignUnassigned } from "@/lib/accounts";
import { assignSchema } from "../../shared";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    assignSchema.parse(await req.json());
    const result = await assignUnassigned(user.id, id);
    if (result.status === "not_found") return jsonError(404, "Not found");
    if (result.status === "invalid") return jsonError(400, result.error);
    return NextResponse.json({ ok: true, assigned: result.assigned, skipped: result.skipped });
  } catch (e) {
    return routeError(e, "POST /api/accounts/[id]/assign");
  }
}
