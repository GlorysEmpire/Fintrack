/**
 * GET  /api/recurring — the signed-in user's recurring rules
 * POST /api/recurring — create one
 *
 * A rule only schedules. The daily job records the transactions.
 */
import { NextResponse } from "next/server";
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { createRule, listRules } from "@/lib/recurring-rules";
import { createRuleSchema, ruleResponse } from "./shared";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ ok: true, rules: await listRules(user.id) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const body = createRuleSchema.parse(await req.json());
    return ruleResponse(await createRule(user.id, body));
  } catch (e) {
    return routeError(e, "POST /api/recurring");
  }
}
