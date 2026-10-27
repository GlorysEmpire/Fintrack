/**
 * The dashboard's month numbers must come from the whole month, however many
 * transactions it holds.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { cleanup, createUser, seedPlan, seedTx, signIn } from "@/test/harness";
import { GET } from "./route";

afterEach(cleanup);

describe("GET /api/dashboard — a busy month", () => {
  it("adds up all 150 incomes, not just the latest 100", async () => {
    const user = await createUser();
    signIn(user);
    await seedPlan(user.id);
    for (let i = 0; i < 150; i++) {
      await seedTx(user.id, { type: "i", amount: 100, date: new Date(Date.now() - i * 1000) });
    }

    const body = await (await GET()).json();
    expect(body.snapshot.income).toBe(15_000);
    expect(body.transactions).toHaveLength(150);
    expect(body.recentAll).toHaveLength(20);
  });
});
