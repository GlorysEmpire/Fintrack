/**
 * POST /api/auth/verify
 * Body: { email, code }
 * On success: sets httpOnly session cookie and returns user + onboarding state.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie, verifyOtp } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { email, code } = bodySchema.parse(json);
    const result = await verifyOtp(email, code);

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired code. Request a new one." },
        { status: 401 }
      );
    }

    await setSessionCookie(result.token, result.expiresAt);

    return NextResponse.json({
      ok: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        onboarding: result.user.onboarding,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
