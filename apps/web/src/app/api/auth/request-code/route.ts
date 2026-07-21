/**
 * POST /api/auth/request-code
 * Body: { email }
 * Creates OTP, emails it (Resend) or logs it (dev).
 * Never returns the code in production.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtp } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { email } = bodySchema.parse(json);
    const result = await createOtp(email);

    return NextResponse.json({
      ok: true,
      email: result.email,
      expiresAt: result.expiresAt.toISOString(),
      // Only when AUTH_DEV_SHOW_CODE=true AND not production
      ...(result.showCode ? { devCode: result.code } : {}),
      message: result.showCode
        ? "Dev mode: use the code below (also printed in the server terminal)."
        : result.delivery.sent
          ? "Check your email for a 6-digit login code."
          : "If that email can receive mail, a login code is on its way.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
