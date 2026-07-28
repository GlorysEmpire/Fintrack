import { describe, expect, it } from "vitest";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "./password";

describe("validatePasswordStrength", () => {
  it("rejects short passwords", () => {
    expect(validatePasswordStrength("short").ok).toBe(false);
    expect(validatePasswordStrength("1234567").ok).toBe(false);
  });

  it("accepts 8+ chars and warns without number/symbol", () => {
    const r = validatePasswordStrength("abcdefgh");
    expect(r.ok).toBe(true);
    expect(r.warning).toBeTruthy();
  });

  it("accepts with number without warning", () => {
    const r = validatePasswordStrength("abcdefg1");
    expect(r.ok).toBe(true);
    expect(r.warning).toBeUndefined();
  });
});

describe("hashPassword / verifyPassword", () => {
  it("round-trips Argon2id", async () => {
    const hash = await hashPassword("correct horse1");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("correct horse1", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });
});
