import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BUCKET_DESCRIPTIONS, isCrossBucket } from "./bucket-categories";

describe("Transport belongs to Save, not to personal spending", () => {
  it("is a normal Save expense and a cross-bucket one if put under Spend", () => {
    assert.equal(isCrossBucket("save", "transport"), false);
    assert.equal(isCrossBucket("spend", "transport"), true);
  });

  it("says so in Save's description", () => {
    assert.match(BUCKET_DESCRIPTIONS.save, /Transport/);
  });
});
