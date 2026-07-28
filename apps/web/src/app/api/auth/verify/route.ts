/**
 * POST /api/auth/verify
 * Body: { email, code }
 * On success: sets httpOnly session cookie and returns user + onboarding state.
 *
 * Rate limit: 10 verify attempts / IP / 10 min.
 * Wrong codes: EmailOtp.attempts; 5 wrong → code invalidated.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie, toPublicUser, verifyOtp } from "@/lib/auth";
import {
  clientIp,
  retryAfterSeconds,
  verifyIpLimiter,
} from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
});

const INVALID_MSG = "Invalid or expired code. Request a new one.";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const ipLimit = await verifyIpLimiter.limit(ip);
    if (!ipLimit.success) {
      const retry = retryAfterSeconds(ipLimit);
      return NextResponse.json(
        { ok: false, error: "Too many verification attempts. Try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retry),
            "X-RateLimit-Limit": String(ipLimit.limit),
            "X-RateLimit-Remaining": String(ipLimit.remaining),
          },
        }
      );
    }

    const json = await req.json();
    const { email, code } = bodySchema.parse(json);
    const result = await verifyOtp(email, code);

    if (!result) {
      // Generic failure: wrong code, expired, or locked out after 5 attempts
      return NextResponse.json(
        { ok: false, error: INVALID_MSG },
        { status: 400 }
      );
    }

    await setSessionCookie(result.token, result.expiresAt);

    return NextResponse.json({
      ok: true,
      user: toPublicUser(result.user),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
