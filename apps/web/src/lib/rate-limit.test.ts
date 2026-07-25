import { beforeEach, describe, expect, it, vi } from "vitest";

describe("OTP rate limiters (in-memory)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("blocks the 4th request for the same email within 10 min", async () => {
    const { otpEmailLimiter } = await import("./rate-limit");
    const email = `rate-${Date.now()}@example.com`;
    expect((await otpEmailLimiter.limit(email)).success).toBe(true);
    expect((await otpEmailLimiter.limit(email)).success).toBe(true);
    expect((await otpEmailLimiter.limit(email)).success).toBe(true);
    const fourth = await otpEmailLimiter.limit(email);
    expect(fourth.success).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("blocks the 11th request for the same IP within 1 hour", async () => {
    const { otpIpLimiter } = await import("./rate-limit");
    const ip = `ip-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      expect((await otpIpLimiter.limit(ip)).success).toBe(true);
    }
    expect((await otpIpLimiter.limit(ip)).success).toBe(false);
  });

  it("extracts first x-forwarded-for hop", async () => {
    const { clientIp } = await import("./rate-limit");
    const req = new Request("http://localhost/api", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        "x-real-ip": "198.51.100.1",
      },
    });
    expect(clientIp(req)).toBe("203.0.113.10");
  });
});
