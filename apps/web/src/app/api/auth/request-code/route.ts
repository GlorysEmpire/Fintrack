/**
 * POST /api/auth/request-code
 * Body: { email }
 * Creates OTP, emails it (Resend) or logs it (dev).
 * Never returns the code in production.
 *
 * Rate limits (Upstash when configured):
 *  - 3 requests / email / 10 min
 *  - 10 requests / IP / hour
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtp } from "@/lib/auth";
import {
  clientIp,
  otpEmailLimiter,
  otpIpLimiter,
  retryAfterSeconds,
  type LimitResult,
} from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().email(),
});

function rateLimited(result: LimitResult) {
  const retry = retryAfterSeconds(result);
  return NextResponse.json(
    {
      ok: false,
      error: "Too many login code requests. Try again later.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retry),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { email } = bodySchema.parse(json);
    const normalized = email.trim().toLowerCase();
    const ip = clientIp(req);

    const emailLimit = await otpEmailLimiter.limit(normalized);
    if (!emailLimit.success) {
      return rateLimited(emailLimit);
    }

    const ipLimit = await otpIpLimiter.limit(ip);
    if (!ipLimit.success) {
      return rateLimited(ipLimit);
    }

    const result = await createOtp(normalized);

    return NextResponse.json({
      ok: true,
      email: result.email,
      expiresAt: result.expiresAt.toISOString(),
      // Only when AUTH_DEV_SHOW_CODE is allowed (local / Vercel development)
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
