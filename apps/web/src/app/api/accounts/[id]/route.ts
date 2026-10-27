/**
 * PATCH /api/accounts/[id] — rename, change the institution, archive or
 * reactivate; change the opening balance until the account has activity.
 * There is no DELETE: an account that history refers to is archived instead.
 */
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { updateAccount } from "@/lib/accounts";
import { accountResponse, updateAccountSchema } from "../shared";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    const patch = updateAccountSchema.parse(await req.json());
    return accountResponse(await updateAccount(user.id, id, patch));
  } catch (e) {
    return routeError(e, "PATCH /api/accounts/[id]");
  }
}
