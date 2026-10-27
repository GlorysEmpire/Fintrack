/**
 * GET /api/performance — month-by-month income, expenses, expense rate,
 * surplus, plan adherence and retained balances, a like-for-like comparison with
 * the previous month, the expense-rate trend, and account movement.
 * Read-only and deterministic; scoped to the signed-in user.
 */
import { NextResponse } from "next/server";
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { getPerformance } from "@/lib/performance";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    return NextResponse.json({ ok: true, ...(await getPerformance(user)) });
  } catch (e) {
    return routeError(e, "GET /api/performance");
  }
}
