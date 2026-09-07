/**
 * POST /api/auth/set-password — signup intent guard.
 *
 * Privacy contract:
 *  - Before OTP verification the server never reveals whether an email has an
 *    account (request-code sends the same code for existing and new emails).
 *  - After a valid OTP proves email ownership, signup (intent: "signup") must
 *    NOT silently reset an existing account's password → 409 + sign-in prompt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeOtp = vi.fn();
const userHasPassword = vi.fn();
const setUserPassword = vi.fn();
const createSessionForUser = vi.fn();
const setSessionCookie = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/auth", () => ({
  consumeOtp: (...a: unknown[]) => consumeOtp(...a),
  userHasPassword: (...a: unknown[]) => userHasPassword(...a),
  setUserPassword: (...a: unknown[]) => setUserPassword(...a),
  createSessionForUser: (...a: unknown[]) => createSessionForUser(...a),
  setSessionCookie: (...a: unknown[]) => setSessionCookie(...a),
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
  toPublicUser: (user: {
    id: string;
    email: string;
    onboarding: string;
    passwordHash?: string | null;
  }) => ({
    id: user.id,
    email: user.email,
    onboarding: user.onboarding,
    hasPassword: Boolean(user.passwordHash),
  }),
}));

vi.mock("@/lib/password", () => ({
  validatePasswordStrength: () => ({ ok: true, warning: null }),
}));

const ip = (n: number) => `203.0.113.${n}`;

function call(body: Record<string, unknown>, n: number) {
  return POST(
    new Request("http://localhost/api/auth/set-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip(n),
      },
      body: JSON.stringify(body),
    })
  );
}

import { POST } from "./route";

describe("POST /api/auth/set-password signup intent", () => {
  beforeEach(() => {
    consumeOtp.mockReset();
    userHasPassword.mockReset();
    setUserPassword.mockReset();
    createSessionForUser.mockReset();
    setSessionCookie.mockReset();
    getSessionUser.mockReset();
    getSessionUser.mockResolvedValue(null);
  });

  it("rejects mismatched passwords before any OTP check", async () => {
    const res = await call(
      {
        email: "a@b.com",
        code: "123456",
        password: "password1",
        confirmPassword: "password2",
        intent: "signup",
      },
      10
    );
    expect(res.status).toBe(400);
    expect(consumeOtp).not.toHaveBeenCalled();
    expect(userHasPassword).not.toHaveBeenCalled();
    expect(setUserPassword).not.toHaveBeenCalled();
  });

  it("409s AFTER valid OTP when the email already has a password — never silently resets it", async () => {
    consumeOtp.mockResolvedValue({ email: "existing@b.com" });
    userHasPassword.mockResolvedValue(true);

    const res = await call(
      {
        email: "existing@b.com",
        code: "123456",
        password: "password1",
        confirmPassword: "password1",
        intent: "signup",
      },
      11
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(String(data.error).toLowerCase()).toMatch(/already exists/);
    // OTP was consumed (identity proven) but no password was written
    expect(consumeOtp).toHaveBeenCalledTimes(1);
    expect(setUserPassword).not.toHaveBeenCalled();
    expect(createSessionForUser).not.toHaveBeenCalled();
  });

  it("creates the account + session for a genuinely new email after valid OTP", async () => {
    consumeOtp.mockResolvedValue({ email: "new@b.com" });
    userHasPassword.mockResolvedValue(false);
    setUserPassword.mockResolvedValue({
      user: {
        id: "u-new",
        email: "new@b.com",
        onboarding: "pending",
        passwordHash: "hash",
      },
    });
    createSessionForUser.mockResolvedValue({
      token: "tok",
      expiresAt: new Date(Date.now() + 1000),
      user: {
        id: "u-new",
        email: "new@b.com",
        onboarding: "pending",
        passwordHash: "hash",
      },
    });

    const res = await call(
      {
        email: "new@b.com",
        code: "123456",
        password: "password1",
        confirmPassword: "password1",
        intent: "signup",
      },
      12
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user.onboarding).toBe("pending");
    expect(userHasPassword).toHaveBeenCalledTimes(1);
    expect(setUserPassword).toHaveBeenCalledWith("new@b.com", "password1");
    expect(setSessionCookie).toHaveBeenCalled();
  });

  it("keeps forgot-password working: reset path (no intent) may update an existing password", async () => {
    consumeOtp.mockResolvedValue({ email: "reset@b.com" });
    setUserPassword.mockResolvedValue({
      user: {
        id: "u-reset",
        email: "reset@b.com",
        onboarding: "completed",
        passwordHash: "newhash",
      },
    });
    createSessionForUser.mockResolvedValue({
      token: "tok",
      expiresAt: new Date(Date.now() + 1000),
      user: {
        id: "u-reset",
        email: "reset@b.com",
        onboarding: "completed",
        passwordHash: "newhash",
      },
    });

    const res = await call(
      {
        email: "reset@b.com",
        code: "123456",
        password: "password1",
        confirmPassword: "password1",
      },
      13
    );
    expect(res.status).toBe(200);
    expect(userHasPassword).not.toHaveBeenCalled();
    expect(setUserPassword).toHaveBeenCalledWith("reset@b.com", "password1");
  });
});
