/**
 * DELETE /api/transfers/[id] — remove a mistaken transfer, during the same
 * edit window as a transaction. After that it is part of the history.
 */
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { deleteTransfer } from "@/lib/transfers";
import { transferResponse } from "../../accounts/shared";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    return transferResponse(await deleteTransfer(user.id, id));
  } catch (e) {
    return routeError(e, "DELETE /api/transfers/[id]");
  }
}
