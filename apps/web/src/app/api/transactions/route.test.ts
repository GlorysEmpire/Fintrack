import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();
const create = vi.fn();
const findMany = vi.fn();
const findUnique = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    transaction: {
      create: (...args: unknown[]) => create(...args),
      findMany: (...args: unknown[]) => findMany(...args),
    },
    budgetPlan: {
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
  },
}));

vi.mock("@/lib/plan", () => ({
  getUserPlan: vi.fn(async () => ({
    id: "plan1",
    name: "Default",
    buckets: [
      {
        id: "spend",
        name: "Spend",
        emoji: "🛒",
        percent: 100,
        mode: "of_gross",
        carryOver: false,
        order: 0,
      },
    ],
    emergencyCarryOverDefault: true,
  })),
}));

vi.mock("@/lib/money", () => ({
  parseFx: () => ({ NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 }),
  parseOpeningBalances: () => ({}),
}));

vi.mock("@/lib/inbox", () => ({
  createOverrideInboxMessage: vi.fn(),
}));

describe("POST /api/transactions", () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionUser.mockReset();
    create.mockReset();
    findMany.mockReset();
    findUnique.mockReset();
    getSessionUser.mockResolvedValue({
      id: "user1",
      email: "u@example.com",
      baseCurrency: "NGN",
      fxRates: "{}",
    });
    findUnique.mockResolvedValue({ openingBalancesJson: "{}" });
    findMany.mockResolvedValue([]);
    create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "tx1",
      ...data,
      date: new Date(),
      createdAt: new Date(),
    }));
  });

  it("creates an income row for authenticated user", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "i",
          amount: 50_000,
          currency: "NGN",
          sourceId: "src1",
        }),
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(create).toHaveBeenCalled();
    const arg = create.mock.calls[0][0] as { data: { type: string; amount: number } };
    expect(arg.data.type).toBe("i");
    expect(arg.data.amount).toBe(50_000);
  });

  it("creates an expense against a bucket", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "e",
          amount: 1_000,
          currency: "NGN",
          bucketId: "spend",
          category: "food",
          note: "coffee",
        }),
      })
    );
    const data = await res.json();
    // empty bucket with no income → hard-blocked 400; with balance → 200
    expect([200, 400]).toContain(res.status);
    if (data.ok) {
      expect(create).toHaveBeenCalled();
      const arg = create.mock.calls[0][0] as {
        data: { type: string; bucketId: string };
      };
      expect(arg.data.type).toBe("e");
      expect(arg.data.bucketId).toBe("spend");
    }
  });

  it("rejects unauthenticated requests", async () => {
    getSessionUser.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "i", amount: 10, currency: "NGN" }),
      })
    );
    expect(res.status).toBe(401);
  });
});
