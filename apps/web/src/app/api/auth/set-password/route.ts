/**
 * POST /api/auth/set-password
 *
 * Set or reset password after OTP identity proof.
 * Body: { email, code, password, confirmPassword }
 *
 * - Forgot password (logged out): email + OTP + new password → session
 * - Set password (logged in): email must match session user (or omit → session email)
 * - OTP must be verified before passwordHash is saved
 *
 * Rate limits: OTP verify IP + set-password per email.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  consumeOtp,
  createSessionForUser,
  getSessionUser,
  setSessionCookie,
  setUserPassword,
  toPublicUser,
} from "@/lib/auth";
import { validatePasswordStrength } from "@/lib/password";
import {
  clientIp,
  retryAfterSeconds,
  setPasswordEmailLimiter,
  verifyIpLimiter,
  type LimitResult,
} from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().email().optional(),
  code: z.string().min(4).max(8),
  password: z.string().min(1).max(128),
  confirmPassword: z.string().min(1).max(128),
});

const INVALID_OTP = "Invalid or expired code. Request a new one.";

function rateLimited(result: LimitResult) {
  const retry = retryAfterSeconds(result);
  return NextResponse.json(
    { ok: false, error: "Too many attempts. Try again later." },
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
    const ip = clientIp(req);
    const ipLimit = await verifyIpLimiter.limit(ip);
    if (!ipLimit.success) return rateLimited(ipLimit);

    const json = await req.json();
    const body = bodySchema.parse(json);

    if (body.password !== body.confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "Passwords do not match." },
        { status: 400 }
      );
    }

    const strength = validatePasswordStrength(body.password);
    if (!strength.ok) {
      return NextResponse.json(
        { ok: false, error: strength.error || "Invalid password" },
        { status: 400 }
      );
    }

    const sessionUser = await getSessionUser();
    const emailRaw = body.email?.trim().toLowerCase() || sessionUser?.email;
    if (!emailRaw) {
      return NextResponse.json(
        { ok: false, error: "Email is required." },
        { status: 400 }
      );
    }

    // Logged-in users may only set password for their own account
    if (sessionUser && sessionUser.email !== emailRaw) {
      return NextResponse.json(
        { ok: false, error: "Email does not match your session." },
        { status: 403 }
      );
    }

    const emailLimit = await setPasswordEmailLimiter.limit(emailRaw);
    if (!emailLimit.success) return rateLimited(emailLimit);

    const consumed = await consumeOtp(emailRaw, body.code);
    if (!consumed) {
      return NextResponse.json(
        { ok: false, error: INVALID_OTP },
        { status: 400 }
      );
    }

    const setResult = await setUserPassword(emailRaw, body.password);
    if ("error" in setResult) {
      return NextResponse.json(
        { ok: false, error: setResult.error },
        { status: 400 }
      );
    }

    // Issue session if not already logged in (forgot-password path)
    let user = setResult.user;
    if (!sessionUser) {
      const session = await createSessionForUser(user);
      await setSessionCookie(session.token, session.expiresAt);
      user = session.user;
    }

    return NextResponse.json({
      ok: true,
      user: toPublicUser(user),
      warning: strength.warning,
      message: sessionUser
        ? "Password saved. You can sign in with email and password next time."
        : "Password saved. You are signed in.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
