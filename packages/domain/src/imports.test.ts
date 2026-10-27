import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_WINDOW_DAYS,
  applyProviderUpdate,
  retryDelayMs,
  suggestMatches,
  type MatchCandidate,
} from "./imports";

const stored = (status: "pending" | "posted" | "reversed", amountMinor: number, review: "new" | "accepted" | "matched" | "ignored" = "new") => ({
  status, amountMinor, review,
});
const incoming = (status: "pending" | "posted" | "reversed", amountMinor: number) => ({
  externalId: "x", status, amountMinor, currency: "NGN",
});

describe("applyProviderUpdate", () => {
  it("nothing new means unchanged", () => {
    assert.deepEqual(applyProviderUpdate(stored("posted", -5000), incoming("posted", -5000)), { kind: "unchanged" });
  });

  it("a pending import settles into posted, and its amount may settle too", () => {
    assert.deepEqual(applyProviderUpdate(stored("pending", -5000), incoming("posted", -5100)), {
      kind: "update", status: "posted", amountMinor: -5100,
    });
  });

  it("a posted import never goes back to pending, and its amount stays final", () => {
    assert.deepEqual(applyProviderUpdate(stored("posted", -5000), incoming("pending", -9999)), { kind: "unchanged" });
  });

  it("a reversal is applied while nobody has acted on the import", () => {
    assert.deepEqual(applyProviderUpdate(stored("posted", -5000), incoming("reversed", -5000)), {
      kind: "update", status: "reversed", amountMinor: -5000,
    });
  });

  it("a reversed import stays reversed", () => {
    assert.deepEqual(applyProviderUpdate(stored("reversed", -5000), incoming("posted", -5000)), { kind: "unchanged" });
  });

  it("once accepted or matched, a bank change is flagged and never applied", () => {
    for (const review of ["accepted", "matched"] as const) {
      const rev = applyProviderUpdate(stored("posted", -5000, review), incoming("reversed", -5000));
      assert.equal(rev.kind, "attention");
      assert.match((rev as { reason: string }).reason, /reversed/);
      const amt = applyProviderUpdate(stored("posted", -5000, review), incoming("posted", -4000));
      assert.equal(amt.kind, "attention");
      assert.match((amt as { reason: string }).reason, /changed the amount/);
    }
  });

  it("an ignored import may still be updated quietly", () => {
    assert.equal(applyProviderUpdate(stored("pending", -5000, "ignored"), incoming("posted", -5000)).kind, "update");
  });
});

describe("suggestMatches", () => {
  const imp = { accountId: "a1", currency: "NGN", amountMinor: -250_000, dayKey: "2026-10-10" };
  const cand = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
    id: "t1", accountId: "a1", type: "e", amount: 2500, currency: "NGN", dayKey: "2026-10-10", linked: false, ...over,
  });

  it("finds the same amount, account, direction and currency on the same day", () => {
    assert.deepEqual(suggestMatches(imp, [cand()]), [{ transactionId: "t1", daysApart: 0 }]);
  });

  it("allows a few days either side, closest first", () => {
    const out = suggestMatches(imp, [
      cand({ id: "far", dayKey: "2026-10-13" }),
      cand({ id: "near", dayKey: "2026-10-09" }),
    ]);
    assert.deepEqual(out.map((m) => m.transactionId), ["near", "far"]);
    assert.equal(MATCH_WINDOW_DAYS, 3);
  });

  it("rejects anything that is not the same event", () => {
    const rejected: Partial<MatchCandidate>[] = [
      { dayKey: "2026-10-14" }, // too far
      { amount: 2500.01 }, // different amount
      { accountId: "a2" },
      { accountId: null }, // unassigned to any account
      { currency: "USD" },
      { type: "i" }, // opposite direction
      { linked: true }, // already tied to another import
    ];
    for (const r of rejected) assert.deepEqual(suggestMatches(imp, [cand(r)]), [], JSON.stringify(r));
  });

  it("an incoming credit matches income, not an expense", () => {
    const credit = { ...imp, amountMinor: 250_000 };
    assert.equal(suggestMatches(credit, [cand({ type: "i" })]).length, 1);
    assert.equal(suggestMatches(credit, [cand({ type: "e" })]).length, 0);
  });

  it("compares amounts in whole minor units, so cents never drift", () => {
    assert.equal(suggestMatches({ ...imp, amountMinor: -1010 }, [cand({ amount: 10.1 })]).length, 1);
  });
});

describe("retryDelayMs", () => {
  it("backs off 5 minutes, doubling, to a 6 hour cap", () => {
    assert.equal(retryDelayMs(0), 0);
    assert.equal(retryDelayMs(1), 5 * 60_000);
    assert.equal(retryDelayMs(2), 10 * 60_000);
    assert.equal(retryDelayMs(3), 20 * 60_000);
    assert.equal(retryDelayMs(20), 6 * 60 * 60_000);
  });
});
