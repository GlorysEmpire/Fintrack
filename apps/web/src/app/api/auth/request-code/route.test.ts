import { beforeEach, describe, expect, it, vi } from "vitest";

const createOtp = vi.fn();

vi.mock("@/lib/auth", () => ({
  createOtp: (...args: unknown[]) => createOtp(...args),
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
