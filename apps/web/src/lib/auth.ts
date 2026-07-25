/**
 * Auth helpers — email one-time codes (OTP) + cookie sessions.
 *
 * Flow:
 *  1. User enters email → createOtp() stores code + sends email
 *  2. User enters code → verifyOtp() creates/finds User + Session
 *  3. Session token in httpOnly cookie (ft_session)
 *
 * Later optional: 2FA authenticator, blockchain-linked identity.
 */
import { cookies } from "next/headers";
import { prisma } from "./db";
import { isDevShowCode, sendLoginCodeEmail } from "./email";
import { randomBytes, randomInt } from "crypto";

export const SESSION_COOKIE = "ft_session";

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Create a login code and deliver it (Resend in prod, console in dev).
 */
export async function createOtp(email: string) {
  const normalized = email.trim().toLowerCase();
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.emailOtp.updateMany({
    where: { email: normalized, consumed: false },
    data: { consumed: true },
  });

  const otp = await prisma.emailOtp.create({
    data: { email: normalized, code, expiresAt },
  });

  const delivery = await sendLoginCodeEmail({ to: normalized, code });

  return {
    email: normalized,
    expiresAt,
    otpId: otp.id,
    code,
    delivery,
    showCode: isDevShowCode(),
  };
}

const OTP_MAX_ATTEMPTS = 5;

/**
 * Verify a login code.
 * Wrong guesses increment EmailOtp.attempts; at 5 the code is consumed
 * (invalidated) so a later correct guess still fails.
 */
export async function verifyOtp(email: string, code: string) {
  const normalized = email.trim().toLowerCase();
  const submitted = code.trim();

  const otp = await prisma.emailOtp.findFirst({
    where: {
      email: normalized,
      consumed: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return null;

  if (otp.code !== submitted) {
    const attempts = otp.attempts + 1;
    await prisma.emailOtp.update({
      where: { id: otp.id },
      data: {
        attempts,
        // Invalidate after 5 wrong guesses
        ...(attempts >= OTP_MAX_ATTEMPTS ? { consumed: true } : {}),
      },
    });
    return null;
  }

  await prisma.emailOtp.update({
    where: { id: otp.id },
    data: { consumed: true },
  });

  let user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: normalized },
    });
  }

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { token, userId: user.id, expiresAt },
  });

  return { user, token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  return session.user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  await clearSessionCookie();
}
