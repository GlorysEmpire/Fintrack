/**
 * Auth helpers — email OTP + password + cookie sessions.
 *
 * Flows:
 *  1. OTP: request code → verifyOtp() → User + Session
 *  2. Password: loginWithPassword() → Session (user must have passwordHash)
 *  3. Set / reset password: consumeOtp() + setUserPassword() (OTP identity proof)
 *
 * Session token in httpOnly cookie (ft_session).
 * Never return passwordHash to clients.
 */
import { cookies } from "next/headers";
import { prisma } from "./db";
import { isDevShowCode, sendLoginCodeEmail } from "./email";
import { hashPassword, validatePasswordStrength } from "./password";
import { randomBytes, randomInt } from "crypto";
import type { User } from "@prisma/client";

export const SESSION_COOKIE = "ft_session";

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export type PublicUser = {
  id: string;
  email: string;
  onboarding: string;
  hasPassword: boolean;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    onboarding: user.onboarding,
    hasPassword: Boolean(user.passwordHash),
  };
}

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

/**
 * Validate + consume a live OTP. Does not create a user or session.
 * Wrong guesses increment attempts; at 5 the code is invalidated.
 */
export async function consumeOtp(
  email: string,
  code: string
): Promise<{ email: string } | null> {
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
        ...(attempts >= OTP_MAX_ATTEMPTS ? { consumed: true } : {}),
      },
    });
    return null;
  }

  await prisma.emailOtp.update({
    where: { id: otp.id },
    data: { consumed: true },
  });

  return { email: normalized };
}

export async function findOrCreateUser(email: string): Promise<User> {
  const normalized = email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: normalized },
    });
  }
  return user;
}

export async function createSessionForUser(user: User) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { token, userId: user.id, expiresAt },
  });
  return { user, token, expiresAt };
}

/**
 * Verify a login code → find/create user + session.
 */
export async function verifyOtp(email: string, code: string) {
  const consumed = await consumeOtp(email, code);
  if (!consumed) return null;

  const user = await findOrCreateUser(consumed.email);
  return createSessionForUser(user);
}

/**
 * Email + password login. Generic failure message for unknown user / bad password.
 */
export async function loginWithPassword(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  // Constant-ish path: always run verify when hash present; never reveal which failed.
  if (!user?.passwordHash) {
    return null;
  }

  const { verifyPassword } = await import("./password");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  return createSessionForUser(user);
}

/**
 * Set or replace password after successful OTP identity proof.
 * Creates the user if this is their first interaction (forgot on new email).
 */
export async function setUserPassword(
  email: string,
  password: string
): Promise<{ user: User } | { error: string }> {
  const strength = validatePasswordStrength(password);
  if (!strength.ok) {
    return { error: strength.error || "Invalid password" };
  }

  const hash = await hashPassword(password);
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.upsert({
    where: { email: normalized },
    create: { email: normalized, passwordHash: hash },
    update: { passwordHash: hash },
  });

  return { user };
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
