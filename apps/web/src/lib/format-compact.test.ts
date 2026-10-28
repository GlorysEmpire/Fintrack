import { describe, expect, it } from "vitest";
import { formatCompactMoney } from "./format-compact";

describe("formatCompactMoney", () => {
  it("shortens by thousands, millions, billions and trillions", () => {
    expect(formatCompactMoney(950_000, "NGN")).toBe("₦950K");
    expect(formatCompactMoney(12_345, "NGN")).toBe("₦12.3K");
    expect(formatCompactMoney(1_284_500, "NGN")).toBe("₦1.28M");
    expect(formatCompactMoney(987_654_321_098, "NGN")).toBe("₦988B");
    expect(formatCompactMoney(2_500_000_000_000, "USD")).toBe("$2.5T");
  });
  it("leaves small amounts whole, and drops the sign (the caller shows it)", () => {
    expect(formatCompactMoney(999, "NGN")).toBe("₦999");
    expect(formatCompactMoney(0, "GBP")).toBe("£0");
    expect(formatCompactMoney(-1_500_000, "NGN")).toBe("₦1.5M");
  });
});
