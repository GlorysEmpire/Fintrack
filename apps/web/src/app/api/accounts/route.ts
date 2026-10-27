/**
 * GET  /api/accounts — the signed-in user's accounts with derived balances
 * POST /api/accounts — create one
 */
import { NextResponse } from "next/server";
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { createAccount, listAccounts } from "@/lib/accounts";
import { accountResponse, createAccountSchema } from "./shared";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ ok: true, ...(await listAccounts(user.id)) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const body = createAccountSchema.parse(await req.json());
    return accountResponse(await createAccount(user.id, body));
  } catch (e) {
    return routeError(e, "POST /api/accounts");
  }
}
