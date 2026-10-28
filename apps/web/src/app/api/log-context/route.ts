/**
 * GET /api/log-context — what the log sheet needs, for the signed-in user.
 */
import { NextResponse } from "next/server";
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { getLogContext } from "@/lib/log-context";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    return NextResponse.json({ ok: true, context: await getLogContext(user) });
  } catch (e) {
    return routeError(e, "GET /api/log-context");
  }
}
