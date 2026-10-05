/**
 * PATCH  /api/transactions/:id — edit a transaction while it is still editable
 * DELETE /api/transactions/:id — remove a mistaken log while it is still editable
 *
 * Both answer 423 once the edit window has closed (see transaction-rules in
 * the domain): a locked transaction is a permanent part of the history.
 */
import { NextResponse } from "next/server";
import { jsonError, routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { deleteTransaction, updateTransaction } from "@/lib/transactions";
import { transactionResponse, updateTransactionSchema } from "../shared";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const { id } = await ctx.params;
    const body = updateTransactionSchema.parse(await req.json());
    return transactionResponse(await updateTransaction(user, id, body));
  } catch (e) {
    return routeError(e, "PATCH /api/transactions/:id");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const { id } = await ctx.params;
    const result = await deleteTransaction(user, id);
    if (result.status === "deleted") return NextResponse.json({ ok: true });
    if (result.status === "not_found") return jsonError(404, "Not found");
    return transactionResponse(result);
  } catch (e) {
    return routeError(e, "DELETE /api/transactions/:id");
  }
}
