/**
 * GET /api/accounts/[id]/history — everything that moved one account, newest
 * first, with the balance after each event.
 */
import { NextResponse } from "next/server";
import { jsonError, routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { accountHistory } from "@/lib/accounts";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    const result = await accountHistory(user.id, id);
    if (result.status === "not_found") return jsonError(404, "Not found");
    return NextResponse.json({ ok: true, events: result.events, total: result.total });
  } catch (e) {
    return routeError(e, "GET /api/accounts/[id]/history");
  }
}
