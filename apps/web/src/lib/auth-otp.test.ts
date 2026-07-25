/**
 * OTP lockout behavior with mocked Prisma (no live DB required).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const update = vi.fn();
const findUnique = vi.fn();
const createUser = vi.fn();
const createSession = vi.fn();

vi.mock("./db", () => ({
  prisma: {
    emailOtp: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      update: (...a: unknown[]) => update(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      create: (...a: unknown[]) => createUser(...a),
    },
    session: {
      create: (...a: unknown[]) => createSession(...a),
    },
  },
}));

vi.mock("./email", () => ({
  isDevShowCode: () => false,
  sendLoginCodeEmail: vi.fn(),
}));

describe("verifyOtp lockout", () => {
  beforeEach(() => {
    vi.resetModules();
    findFirst.mockReset();
    update.mockReset();
    findUnique.mockReset();
    createUser.mockReset();
    createSession.mockReset();
  });

  it("increments attempts and consumes at 5; correct code fails after lockout", async () => {
    const { verifyOtp } = await import("./auth");
    let attempts = 0;
    let consumed = false;
    const otp = {
      id: "otp1",
      email: "lock@example.com",
      code: "123456",
      get attempts() {
        return attempts;
      },
      get consumed() {
        return consumed;
      },
      expiresAt: new Date(Date.now() + 60_000),
    };

    findFirst.mockImplementation(async () => {
      if (consumed) return null;
      return { ...otp, attempts, consumed };
    });
    update.mockImplementation(async ({ data }: { data: { attempts?: number; consumed?: boolean } }) => {
      if (typeof data.attempts === "number") attempts = data.attempts;
      if (data.consumed) consumed = true;
      return { ...otp, attempts, consumed };
    });

    for (let i = 0; i < 5; i++) {
      expect(await verifyOtp("lock@example.com", "000000")).toBeNull();
    }
    expect(attempts).toBe(5);
    expect(consumed).toBe(true);

    // 6th — even correct code — no live OTP
    expect(await verifyOtp("lock@example.com", "123456")).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("succeeds on correct first attempt", async () => {
    const { verifyOtp } = await import("./auth");
    findFirst.mockResolvedValue({
      id: "otp2",
      email: "ok@example.com",
      code: "999888",
      attempts: 0,
      consumed: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    update.mockResolvedValue({});
    findUnique.mockResolvedValue({
      id: "u1",
      email: "ok@example.com",
      onboarding: "completed",
    });
    createSession.mockResolvedValue({});

    const result = await verifyOtp("ok@example.com", "999888");
    expect(result).not.toBeNull();
    expect(result?.user.email).toBe("ok@example.com");
    expect(createSession).toHaveBeenCalled();
  });
});
