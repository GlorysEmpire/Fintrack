import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const setSessionCookie = vi.fn();

vi.mock("@/lib/auth", () => ({
  verifyOtp: (...args: unknown[]) => verifyOtp(...args),
  setSessionCookie: (...args: unknown[]) => setSessionCookie(...args),
}));

describe("POST /api/auth/verify", () => {
  beforeEach(() => {
    vi.resetModules();
    verifyOtp.mockReset();
    setSessionCookie.mockReset();
  });

  it("returns user on success", async () => {
    verifyOtp.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", onboarding: "completed" },
      token: "tok",
      expiresAt: new Date(Date.now() + 1000),
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200)}`,
        },
        body: JSON.stringify({ email: "a@b.com", code: "123456" }),
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user.email).toBe("a@b.com");
    expect(setSessionCookie).toHaveBeenCalled();
  });

  it("returns 400 on wrong code", async () => {
    verifyOtp.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
        },
        body: JSON.stringify({ email: "a@b.com", code: "000000" }),
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(String(data.error).toLowerCase()).toMatch(/invalid|expired/);
  });
});
