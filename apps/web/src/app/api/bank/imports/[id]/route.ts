/**
 * POST /api/bank/imports/[id] — { action: "accept" | "match" | "ignore" | "reopen" | "acknowledge" }
 * The only way a bank transaction becomes part of the user's history, and only
 * through the same rules as one typed by hand.
 */
import { routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { acceptImport, acknowledgeChange, ignoreImport, matchImport } from "@/lib/bank/review";
import { importActionSchema, reviewResponse } from "../../shared";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    const body = importActionSchema.parse(await req.json());
    switch (body.action) {
      case "accept":
        return reviewResponse(await acceptImport(user, id, body));
      case "match":
        return reviewResponse(await matchImport(user.id, id, body.transactionId));
      case "ignore":
        return reviewResponse(await ignoreImport(user.id, id));
      case "reopen":
        return reviewResponse(await ignoreImport(user.id, id, true));
      case "acknowledge":
        return reviewResponse(await acknowledgeChange(user.id, id));
    }
  } catch (e) {
    return routeError(e, "POST /api/bank/imports/[id]");
  }
}
