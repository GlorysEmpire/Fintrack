/**
 * POST /api/auth/login
 * Body: { email, password }
 * Email + password primary login. Sets httpOnly session cookie.
 *
 * Rate limits: 5 / email / 15m, 20 / IP / 15m.
 * Generic errors — no user enumeration.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { loginWithPassword, setSessionCookie, toPublicUser } from "@/lib/auth";
import {
  clientIp,
  loginEmailLimiter,
  loginIpLimiter,
  retryAfterSeconds,
  type LimitResult,
} from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const INVALID_MSG = "Invalid email or password.";

function rateLimited(result: LimitResult) {
  const retry = retryAfterSeconds(result);
  return NextResponse.json(
    { ok: false, error: "Too many login attempts. Try again later." },
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
    const { email, password } = bodySchema.parse(json);
    const normalized = email.trim().toLowerCase();
    const ip = clientIp(req);

    const emailLimit = await loginEmailLimiter.limit(normalized);
    if (!emailLimit.success) return rateLimited(emailLimit);

    const ipLimit = await loginIpLimiter.limit(ip);
    if (!ipLimit.success) return rateLimited(ipLimit);

    const result = await loginWithPassword(normalized, password);
    if (!result) {
      return NextResponse.json(
        { ok: false, error: INVALID_MSG },
        { status: 401 }
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
