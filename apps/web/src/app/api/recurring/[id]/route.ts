/**
 * PATCH  /api/recurring/[id] — change a rule, pause it (active:false) or resume it
 * DELETE /api/recurring/[id] — delete the rule; transactions it made are kept
 */
import { NextResponse } from "next/server";
import { jsonError, routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { deleteRule, updateRule } from "@/lib/recurring-rules";
import { ruleResponse, updateRuleSchema } from "../shared";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    const patch = updateRuleSchema.parse(await req.json());
    return ruleResponse(await updateRule(user.id, id, patch));
  } catch (e) {
    return routeError(e, "PATCH /api/recurring/[id]");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    return (await deleteRule(user.id, id))
      ? NextResponse.json({ ok: true })
      : jsonError(404, "Not found");
  } catch (e) {
    return routeError(e, "DELETE /api/recurring/[id]");
  }
}
