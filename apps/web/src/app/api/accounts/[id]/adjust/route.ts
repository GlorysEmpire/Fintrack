/**
 * POST /api/accounts/[id]/adjust — "the real balance is X". The difference is
 * recorded as an adjustment: neither income nor spending.
 */
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { adjustBalance } from "@/lib/accounts";
import { accountResponse, adjustSchema } from "../../shared";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    const body = adjustSchema.parse(await req.json());
    return accountResponse(await adjustBalance(user.id, id, body));
  } catch (e) {
    return routeError(e, "POST /api/accounts/[id]/adjust");
  }
}
