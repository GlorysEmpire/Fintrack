import { beforeEach, describe, expect, it, vi } from "vitest";

const createOtp = vi.fn();

vi.mock("@/lib/auth", () => ({
  createOtp: (...args: unknown[]) => createOtp(...args),
}));

// Privacy guardrail: pre-OTP endpoints must NEVER look up accounts. If a
// future change makes request-code consult the user table, this spy throws
// and the privacy tests fail.
const userFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
  },
}));

describe("POST /api/auth/request-code", () => {
  beforeEach(() => {
    vi.resetModules();
    createOtp.mockReset();
    createOtp.mockResolvedValue({
      email: "user@example.com",
      expiresAt: new Date(),
      otpId: "otp_1",
      code: "123456",
      delivery: { sent: false, provider: "console" },
      showCode: true,
    });
  });

  it("returns 429 and does not create OTP on 4th email hit", async () => {
    const { POST } = await import("./route");
    const email = `spam-${Date.now()}@example.com`;
    const ip = `203.0.113.${Math.floor(Math.random() * 200)}`;

    async function hit() {
      return POST(
        new Request("http://localhost/api/auth/request-code", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({ email }),
        })
      );
    }

    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200);
    const fourth = await hit();
    expect(fourth.status).toBe(429);
    expect(fourth.headers.get("Retry-After")).toBeTruthy();
    const body = await fourth.json();
    expect(body.ok).toBe(false);
    // createOtp only for first three
    expect(createOtp).toHaveBeenCalledTimes(3);
  });
});

describe("POST /api/auth/request-code privacy (strict — no account enumeration)", () => {
  beforeEach(() => {
    vi.resetModules();
    userFindUnique.mockReset();
    // Any pre-OTP account lookup is a privacy violation → fail loudly.
    userFindUnique.mockImplementation(() => {
      throw new Error("request-code must not query the user table pre-OTP");
    });
    createOtp.mockReset();
    createOtp.mockResolvedValue({
      email: "",
      expiresAt: new Date(),
      otpId: "otp_1",
      code: "123456",
      delivery: { sent: true, provider: "email" },
      showCode: false,
    });
  });

  async function send(email: string, n: number) {
    const { POST } = await import("./route");
    return POST(
      new Request("http://localhost/api/auth/request-code", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `198.51.100.${n}`,
        },
        body: JSON.stringify({ email }),
      })
    );
  }

  it("never queries the user table — an existing vs new email is indistinguishable", async () => {
    const fresh = await send("fresh-privacy@example.com", 40);
    const existing = await send("existing-privacy@example.com", 41);
    expect(fresh.status).toBe(200);
    expect(existing.status).toBe(200);
    expect(userFindUnique).not.toHaveBeenCalled();

    const a = await fresh.json();
    const b = await existing.json();
    // Same shape, same message for both — no existence signal anywhere.
    expect(a.ok).toBe(b.ok);
    expect(a.message).toBe(b.message);
    expect(a.message).toBe(
      "Check your email for a 6-digit login code."
    );
    const serialized = JSON.stringify({ a, b }).toLowerCase();
    for (const leak of ["already", "registered", "exists", "account"]) {
      expect(serialized).not.toContain(leak);
    }
  });
});
