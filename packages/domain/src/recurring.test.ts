import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysToKey,
  dueOccurrences,
  nextOccurrenceOnOrAfter,
  occurrenceAfter,
} from "./recurring";

describe("occurrenceAfter", () => {
  it("daily and weekly move by whole days, across month and year ends", () => {
    assert.equal(occurrenceAfter("2026-12-31", "daily", null), "2027-01-01");
    assert.equal(occurrenceAfter("2026-02-25", "weekly", null), "2026-03-04");
  });

  it("monthly keeps the chosen day, using a short month's last day when needed", () => {
    assert.equal(occurrenceAfter("2026-01-31", "monthly", 31), "2026-02-28");
    assert.equal(occurrenceAfter("2026-02-28", "monthly", 31), "2026-03-31");
    assert.equal(occurrenceAfter("2026-03-31", "monthly", 31), "2026-04-30");
    assert.equal(occurrenceAfter("2028-01-30", "monthly", 30), "2028-02-29"); // leap year
    assert.equal(occurrenceAfter("2026-12-15", "monthly", 15), "2027-01-15");
  });

  it("monthly with no chosen day uses the day of the date it was given", () => {
    assert.equal(occurrenceAfter("2026-05-10", "monthly", null), "2026-06-10");
  });
});

describe("nextOccurrenceOnOrAfter", () => {
  it("a daily rule starts on the day asked for", () => {
    assert.equal(nextOccurrenceOnOrAfter("2026-10-27", "daily", null, "2026-10-27"), "2026-10-27");
  });

  it("a weekly rule keeps its weekday when resumed later", () => {
    // started Tue 6 Oct; resumed on Thu 22 Oct → next Tuesday is 27 Oct
    assert.equal(nextOccurrenceOnOrAfter("2026-10-06", "weekly", null, "2026-10-22"), "2026-10-27");
    assert.equal(nextOccurrenceOnOrAfter("2026-10-06", "weekly", null, "2026-10-27"), "2026-10-27");
  });

  it("a monthly rule picks this month if its day has not passed, else next month", () => {
    assert.equal(nextOccurrenceOnOrAfter("2026-10-01", "monthly", 28, "2026-10-27"), "2026-10-28");
    assert.equal(nextOccurrenceOnOrAfter("2026-10-01", "monthly", 5, "2026-10-27"), "2026-11-05");
    assert.equal(nextOccurrenceOnOrAfter("2026-10-31", "monthly", 31, "2026-10-31"), "2026-10-31");
    assert.equal(nextOccurrenceOnOrAfter("2026-12-20", "monthly", 5, "2026-12-20"), "2027-01-05");
  });
});

describe("dueOccurrences (catch-up)", () => {
  it("nothing is due before the next occurrence", () => {
    const r = dueOccurrences({ nextKey: "2026-10-28", cadence: "daily", dayOfMonth: null, todayKey: "2026-10-27", limit: 62 });
    assert.deepEqual(r, { keys: [], more: false });
  });

  it("returns every missed day, each under its own date", () => {
    const r = dueOccurrences({ nextKey: "2026-10-25", cadence: "daily", dayOfMonth: null, todayKey: "2026-10-27", limit: 62 });
    assert.deepEqual(r.keys, ["2026-10-25", "2026-10-26", "2026-10-27"]);
    assert.equal(r.more, false);
  });

  it("catches up missed months on the right days", () => {
    const r = dueOccurrences({ nextKey: "2026-07-31", cadence: "monthly", dayOfMonth: 31, todayKey: "2026-10-27", limit: 62 });
    assert.deepEqual(r.keys, ["2026-07-31", "2026-08-31", "2026-09-30"]);
  });

  it("stops at the limit and says more remain", () => {
    const r = dueOccurrences({ nextKey: "2026-10-01", cadence: "daily", dayOfMonth: null, todayKey: "2026-10-27", limit: 5 });
    assert.equal(r.keys.length, 5);
    assert.equal(r.more, true);
  });

  it("ignores an unreadable date instead of looping", () => {
    const r = dueOccurrences({ nextKey: "nonsense", cadence: "daily", dayOfMonth: null, todayKey: "2026-10-27", limit: 5 });
    assert.deepEqual(r, { keys: [], more: false });
  });

  it("addDaysToKey crosses month ends", () => {
    assert.equal(addDaysToKey("2026-02-28", 1), "2026-03-01");
  });
});
