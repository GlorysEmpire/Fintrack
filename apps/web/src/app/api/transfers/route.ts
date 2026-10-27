/**
 * GET  /api/transfers[?accountId=…] — transfers between the user's accounts
 * POST /api/transfers — record one (atomic: it is a single record)
 */
import { NextResponse } from "next/server";
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { createTransfer, listTransfers } from "@/lib/transfers";
import { createTransferSchema, transferResponse } from "../accounts/shared";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const accountId = new URL(req.url).searchParams.get("accountId") || undefined;
  return NextResponse.json({ ok: true, transfers: await listTransfers(user.id, { accountId }) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const body = createTransferSchema.parse(await req.json());
    return transferResponse(await createTransfer(user.id, body));
  } catch (e) {
    return routeError(e, "POST /api/transfers");
  }
}
