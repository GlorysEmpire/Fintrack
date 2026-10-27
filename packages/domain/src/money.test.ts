import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  daysLeftInMonth,
  expenseFriction,
  filterMonthTxs,
  monthKeyOf,
  monthSnapshot,
  openingBalancesForMonth,
  startOfMonth,
  startOfMonthOffset,
} from "./money";
import { TITHE_FIRST_TEMPLATE } from "./templates";

const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };
const plan = {
  id: "p1",
  name: "Tithe",
  emergencyCarryOverDefault: true,
  buckets: TITHE_FIRST_TEMPLATE.plan.buckets,
};

describe("monthSnapshot", () => {
  it("allocates from actual income", () => {
    const txs = [
      {
        type: "i" as const,
        amount: 100_000,
        currency: "NGN",
        date: new Date(),
      },
      {
        type: "e" as const,
        amount: 1_000,
        currency: "NGN",
        bucketId: "spend",
        date: new Date(),
      },
    ];
    const snap = monthSnapshot(plan, txs, "NGN", fx);
    assert.equal(snap.income, 100_000);
    assert.equal(snap.expenses, 1_000);
    const spend = snap.buckets.find((b) => b.bucketId === "spend")!;
    assert.equal(spend.allocated, 8_100);
    assert.equal(spend.spent, 1_000);
    assert.equal(spend.closing, 7_100);
  });
});

describe("expenseFriction", () => {
  it("blocks an expense that is more than the bucket has available", () => {
    const txs = [
      {
        type: "i" as const,
        amount: 100_000,
        currency: "NGN",
        date: new Date(),
      },
    ];
    const f = expenseFriction({
      amountBase: 50_000,
      bucketId: "spend",
      plan,
      txs,
      base: "NGN",
      fx,
    });
    // spend budget is 8100; 50k is way over
    assert.equal(f.wouldOverspend, true);
    assert.equal(f.blocked, true);
    assert.equal(f.overBy, 41_900);
  });
});

// Months follow Lagos (UTC+1), never the machine running the code. These
// instants are chosen so a server in UTC and a laptop in Lagos disagree if the
// code uses the machine's clock.
describe("calendar months are Lagos months", () => {
  const lastHourOfSeptemberUtc = new Date("2026-09-30T23:30:00Z"); // 00:30 on 1 Oct in Lagos
  const firstHourOfOctoberUtc = new Date("2026-10-01T00:30:00Z");

  it("files 23:30 UTC on the last day under the next month", () => {
    assert.equal(monthKeyOf(lastHourOfSeptemberUtc), "2026-10");
    assert.equal(monthKeyOf(new Date("2026-09-30T22:59:00Z")), "2026-09");
    assert.equal(monthKeyOf(firstHourOfOctoberUtc), "2026-10");
  });

  it("starts a month at midnight Lagos, which is 23:00 UTC the day before", () => {
    assert.equal(
      startOfMonth(new Date("2026-10-15T12:00:00Z")).toISOString(),
      "2026-09-30T23:00:00.000Z"
    );
    assert.equal(
      startOfMonthOffset(-1, new Date("2026-01-10T12:00:00Z")).toISOString(),
      "2025-11-30T23:00:00.000Z"
    );
  });

  it("filterMonthTxs keeps a transaction made just after Lagos midnight", () => {
    const tx = { type: "e" as const, amount: 1, currency: "NGN", date: lastHourOfSeptemberUtc };
    assert.equal(filterMonthTxs([tx], new Date("2026-10-15T12:00:00Z")).length, 1);
    const beforeLagosMidnight = { ...tx, date: new Date("2026-09-30T22:30:00Z") };
    assert.equal(filterMonthTxs([beforeLagosMidnight], new Date("2026-10-15T12:00:00Z")).length, 0);
  });

  it("counts days left from the Lagos date", () => {
    // 31 Oct 23:30 UTC is already 1 Nov in Lagos: 29 days left in November
    assert.equal(daysLeftInMonth(new Date("2026-10-31T23:30:00Z")), 29);
    assert.equal(daysLeftInMonth(new Date("2026-10-31T12:00:00Z")), 0);
  });

  it("carries September's leftover into a transaction-free October", () => {
    const carryPlan = {
      id: "p",
      name: "x",
      emergencyCarryOverDefault: true,
      buckets: [
        { id: "save", name: "Save", emoji: "s", percent: 100, mode: "of_gross" as const, carryOver: true, order: 1, layer: "life_plan" as const },
      ],
    };
    const income = { type: "i" as const, amount: 1000, currency: "NGN", date: new Date("2026-09-10T12:00:00Z") };
    const openings = openingBalancesForMonth([income], carryPlan, "NGN", fx, new Date("2026-10-05T12:00:00Z"));
    assert.equal(openings.save, 1000);
  });
});
