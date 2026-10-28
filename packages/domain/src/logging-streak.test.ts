import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loggingStreak, streakAfterLoggingToday } from "./logging-streak";

const now = new Date(Date.UTC(2026, 9, 28, 15));
const day = (offset: number) => new Date(Date.UTC(2026, 9, 28 + offset, 9));

describe("loggingStreak", () => {
  it("counts consecutive days ending today", () => {
    const s = loggingStreak([day(0), day(-1), day(-2), day(-4)], now);
    assert.deepEqual(s, { current: 3, loggedToday: true });
  });

  it("keeps the streak alive through yesterday while today is still open", () => {
    const s = loggingStreak([day(-1), day(-2)], now);
    assert.deepEqual(s, { current: 2, loggedToday: false });
    assert.equal(streakAfterLoggingToday(s), 3);
  });

  it("is zero after a missed day, and starts again at one", () => {
    const s = loggingStreak([day(-2), day(-3)], now);
    assert.deepEqual(s, { current: 0, loggedToday: false });
    assert.equal(streakAfterLoggingToday(s), 1);
  });

  it("counts a day once however many things were logged", () => {
    assert.equal(loggingStreak([day(0), day(0), day(0)], now).current, 1);
  });

  it("crosses month and year boundaries", () => {
    const jan = new Date(Date.UTC(2027, 0, 2, 12));
    const s = loggingStreak([new Date(Date.UTC(2027, 0, 2)), new Date(Date.UTC(2027, 0, 1)), new Date(Date.UTC(2026, 11, 31))], jan);
    assert.equal(s.current, 3);
  });
});
