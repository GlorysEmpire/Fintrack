/**
 * ensureMonthPacked against persisted state.
 *
 * Regression for the live Tithe bug: September was packed while the saved
 * plan had Tithe carryOver=false, so openingBalancesJson had no tithe and
 * lastMonthClosed="2026-09" stopped any re-pack. After the plan is corrected
 * the packer must reconcile the stored openings from history.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TITHE_FIRST_TEMPLATE } from "@fintrack/domain";

const planFindUnique = vi.fn();
const planUpdate = vi.fn();
const userFindUnique = vi.fn();
const txFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    budgetPlan: {
      findUnique: (...args: unknown[]) => planFindUnique(...args),
      update: (...args: unknown[]) => planUpdate(...args),
    },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    transaction: { findMany: (...args: unknown[]) => txFindMany(...args) },
  },
}));

import { ensureMonthPacked } from "./month-close";

const OCT_NOW = new Date(2026, 9, 5);

function bucketsJson(titheCarryOver: boolean) {
  return JSON.stringify(
    TITHE_FIRST_TEMPLATE.plan.buckets.map((b) =>
      b.id === "tithe" ? { ...b, carryOver: titheCarryOver } : b
    )
  );
}

function planRow(opts: {
  titheCarryOver: boolean;
  openingBalancesJson: string;
  lastMonthClosed: string | null;
}) {
  return {
    id: "plan1",
    userId: "user1",
    name: "Tithe-first waterfall",
    templateId: "tithe_first",
    emergencyCarryOverDefault: true,
    bucketsJson: bucketsJson(opts.titheCarryOver),
    openingBalancesJson: opts.openingBalancesJson,
    lastMonthClosed: opts.lastMonthClosed,
  };
}

// September: ₦34,000 income → Tithe ₦3,400; ₦2,400 tithe paid → ₦1,000 left.
const septemberTxs = [
  { type: "i", amount: 34_000, currency: "NGN", bucketId: null, sourceId: null, date: new Date(2026, 8, 12) },
  { type: "e", amount: 2_400, currency: "NGN", bucketId: "tithe", sourceId: null, date: new Date(2026, 8, 20) },
];

// What the old packer stored in October while Tithe had carryOver=false.
const STALE_OCT_OPENINGS = JSON.stringify({
  emergency: 3_060,
  invest: 11_016,
  save: 11_016,
});

function lastWrite() {
  const call = planUpdate.mock.calls.at(-1)![0] as {
    data: { openingBalancesJson: string; lastMonthClosed?: string };
  };
  return {
    openings: JSON.parse(call.data.openingBalancesJson) as Record<string, number>,
    lastMonthClosed: call.data.lastMonthClosed,
  };
}

describe("ensureMonthPacked", () => {
  beforeEach(() => {
    planFindUnique.mockReset();
    planUpdate.mockReset();
    userFindUnique.mockReset();
    txFindMany.mockReset();
    userFindUnique.mockResolvedValue({ id: "user1", baseCurrency: "NGN", fxRates: "{}" });
    txFindMany.mockResolvedValue(septemberTxs);
  });

  it("reconciles October openings packed under the old Tithe rule", async () => {
    planFindUnique.mockResolvedValue(
      planRow({
        titheCarryOver: true, // plan corrected after September was packed
        openingBalancesJson: STALE_OCT_OPENINGS,
        lastMonthClosed: "2026-09",
      })
    );

    const result = await ensureMonthPacked("user1", OCT_NOW);

    expect(result.status).toBe("reconciled");
    expect(planUpdate).toHaveBeenCalledTimes(1);
    const { openings, lastMonthClosed } = lastWrite();
    expect(openings.tithe).toBe(1_000);
    // Legitimate carry-over is preserved, not reset
    expect(openings.emergency).toBe(3_060);
    expect(openings.invest).toBe(11_016);
    expect(openings.save).toBe(11_016);
    // Already-packed marker is left alone
    expect(lastMonthClosed).toBeUndefined();
  });

  it("only reads transactions from before the current month", async () => {
    planFindUnique.mockResolvedValue(
      planRow({ titheCarryOver: true, openingBalancesJson: "{}", lastMonthClosed: "2026-09" })
    );
    await ensureMonthPacked("user1", OCT_NOW);
    expect(txFindMany).toHaveBeenCalledWith({
      where: { userId: "user1", date: { lt: new Date(2026, 9, 1) } },
    });
  });

  it("does nothing when stored openings already match history", async () => {
    planFindUnique.mockResolvedValue(
      planRow({
        titheCarryOver: true,
        openingBalancesJson: JSON.stringify({
          tithe: 1_000,
          emergency: 3_060,
          invest: 11_016,
          save: 11_016,
        }),
        lastMonthClosed: "2026-09",
      })
    );

    const result = await ensureMonthPacked("user1", OCT_NOW);

    expect(result.status).toBe("already");
    expect(planUpdate).not.toHaveBeenCalled();
  });

  it("keeps the old result while the saved plan still says Tithe does not carry", async () => {
    // The packer follows the SAVED plan, not the template constant.
    planFindUnique.mockResolvedValue(
      planRow({
        titheCarryOver: false,
        openingBalancesJson: STALE_OCT_OPENINGS,
        lastMonthClosed: "2026-09",
      })
    );

    const result = await ensureMonthPacked("user1", OCT_NOW);

    expect(result.status).toBe("already");
    expect(planUpdate).not.toHaveBeenCalled();
  });

  it("packs a new month transition and records lastMonthClosed", async () => {
    planFindUnique.mockResolvedValue(
      planRow({ titheCarryOver: true, openingBalancesJson: "{}", lastMonthClosed: "2026-08" })
    );

    const result = await ensureMonthPacked("user1", OCT_NOW);

    expect(result.status).toBe("packed");
    const { openings, lastMonthClosed } = lastWrite();
    expect(openings.tithe).toBe(1_000);
    expect(lastMonthClosed).toBe("2026-09");
  });

  it("skips when the user has no plan", async () => {
    planFindUnique.mockResolvedValue(null);
    const result = await ensureMonthPacked("user1", OCT_NOW);
    expect(result).toEqual({ status: "skipped", reason: "no_plan" });
    expect(planUpdate).not.toHaveBeenCalled();
  });
});
