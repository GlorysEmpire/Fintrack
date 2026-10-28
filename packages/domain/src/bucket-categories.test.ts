import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BUCKET_DESCRIPTIONS, isCrossBucket } from "./bucket-categories";

describe("Transport belongs to Save; Spend is the free-choice bucket", () => {
  it("Transport is a normal Save expense", () => {
    assert.equal(isCrossBucket("save", "transport"), false);
  });

  it("anything may be spent from Spend, except a tithe payment (it has its own bucket)", () => {
    for (const category of ["transport", "bills", "church", "business", "gold", "food", "other"]) {
      assert.equal(isCrossBucket("spend", category), false, category);
    }
    assert.equal(isCrossBucket("spend", "tithe_payment"), true);
  });

  it("the other buckets keep their own rules", () => {
    assert.equal(isCrossBucket("give", "food"), true);
    assert.equal(isCrossBucket("tithe", "food"), true);
    assert.equal(isCrossBucket("tithe", "tithe_payment"), false);
  });

  it("says so in Save's description", () => {
    assert.match(BUCKET_DESCRIPTIONS.save, /Transport/);
  });
});
