/**
 * POST /api/settings/reset — Reset FinTrack
 * Body: { confirmation: "RESET FINTRACK" }
 *
 * Erases the signed-in user's financial data and returns them to setup.
 * See lib/reset.ts for exactly what is erased and what is kept.
 *
 * Guards, in order:
 *   401  not signed in (the user id always comes from the session, never the body)
 *   429  too many attempts
 *   400  the confirmation words were not typed
 * The account, password and sessions are not touched: the user stays signed in.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, routeError, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { resetUserLimiter, retryAfterSeconds } from "@/lib/rate-limit";
import { resetFinancialData } from "@/lib/reset";
import {
  RESET_CONFIRMATION_PHRASE,
  isResetConfirmed,
} from "@/lib/reset-confirmation";

const schema = z.object({ confirmation: z.string().max(100) }).strict();

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const limit = await resetUserLimiter.limit(user.id);
    if (!limit.success) {
      return jsonError(429, "Too many reset attempts. Try again later.", {}, {
        "Retry-After": String(retryAfterSeconds(limit)),
      });
    }

    const body = schema.parse(await req.json());
    if (!isResetConfirmed(body.confirmation)) {
      return jsonError(
        400,
        `Type ${RESET_CONFIRMATION_PHRASE} to confirm. Nothing was changed.`
      );
    }

    const deleted = await resetFinancialData(user.id);
    // Counts only: no amounts, no notes, nothing that identifies the user.
    console.info("[reset] financial data erased", deleted);

    return NextResponse.json({ ok: true, deleted, onboarding: "pending" });
  } catch (e) {
    return routeError(e, "POST /api/settings/reset");
  }
}
