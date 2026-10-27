/**
 * GET /api/bank/imports — bank transactions waiting for a decision, and ones the
 * bank has changed since the user decided. Each carries suggested matches with
 * transactions the user already entered.
 */
import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { listImports } from "@/lib/bank/review";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ ok: true, imports: await listImports(user.id) });
}
