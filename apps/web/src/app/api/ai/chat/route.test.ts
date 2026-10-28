/**
 * Steward conversation: the model must be shown the most RECENT messages, and
 * the Advisor tab must show the latest ones, both in reading order.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

const askSteward = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  askSteward,
}));

import { cleanup, createUser, jsonRequest, seedTx, signIn, testDb } from "@/test/harness";
import { DELETE, GET, POST } from "./route";

afterEach(() => {
  askSteward.mockReset();
  return cleanup();
});

/** `count` messages m1..mN, one minute apart, oldest first */
async function seedConversation(userId: string, count: number) {
  const start = Date.now() - count * 60_000;
  for (let i = 1; i <= count; i++) {
    await testDb.aiMessage.create({
      data: {
        userId,
        role: i % 2 ? "user" : "assistant",
        content: `m${i}`,
        createdAt: new Date(start + i * 60_000),
      },
    });
  }
}

describe("POST /api/ai/chat — conversation history", () => {
  it("gives the model the newest 20 messages, oldest of those first", async () => {
    const user = await createUser();
    signIn(user);
    await seedConversation(user.id, 30);
    askSteward.mockResolvedValue({ reply: "ok", mode: "offline" });

    const res = await POST(jsonRequest("POST", { message: "hello" }));
    expect(res.status).toBe(200);

    const history = askSteward.mock.calls[0][0].history as { content: string }[];
    expect(history).toHaveLength(20);
    expect(history[0].content).toBe("m11");
    expect(history[19].content).toBe("m30");
  });

  it("stores the question before the answer so they read in order", async () => {
    const user = await createUser();
    signIn(user);
    askSteward.mockResolvedValue({ reply: "the answer", mode: "offline" });

    await POST(jsonRequest("POST", { message: "the question" }));

    const res = await GET();
    const body = await res.json();
    expect(body.messages.map((m: { content: string }) => m.content)).toEqual([
      "the question",
      "the answer",
    ]);
  });
});

describe("GET /api/ai/chat — Advisor tab", () => {
  it("shows the latest 40 messages, oldest of those first", async () => {
    const user = await createUser();
    signIn(user);
    await seedConversation(user.id, 55);

    const body = await (await GET()).json();
    const contents = body.messages.map((m: { content: string }) => m.content);
    expect(contents).toHaveLength(40);
    expect(contents[0]).toBe("m16");
    expect(contents[39]).toBe("m55");
  });

  it("never shows another user's conversation", async () => {
    const me = await createUser();
    const other = await createUser();
    signIn(me);
    await seedConversation(other.id, 5);
    const body = await (await GET()).json();
    expect(body.messages).toHaveLength(0);
  });
});

describe("POST /api/ai/chat — the figures it is given", () => {
  it("counts every override, not just those among recent transactions", async () => {
    const user = await createUser();
    signIn(user);
    for (let i = 0; i < 3; i++) {
      await seedTx(user.id, {
        type: "e",
        amount: 10,
        override: true,
        date: new Date(Date.now() - (i + 40) * 86_400_000),
      });
    }
    askSteward.mockResolvedValue({ reply: "ok", mode: "offline" });
    await POST(jsonRequest("POST", { message: "hi" }));
    expect(askSteward.mock.calls[0][0].offlineCtx.overrideCount).toBe(3);
  });
});

describe("POST /api/ai/chat — what the Steward is told", () => {
  it("includes the month, buckets, accounts, recent months, and the facts FinTrack worked out", async () => {
    const user = await createUser();
    signIn(user);
    const { seedPlan } = await import("@/test/harness");
    await seedPlan(user.id);
    await seedTx(user.id, { type: "i", amount: 100_000 });
    const bank = await testDb.account.create({
      data: { userId: user.id, name: "GTBank", kind: "asset", type: "bank", openingBalanceMinor: BigInt(-500_00), openingDate: new Date("2026-01-01T12:00:00Z") },
    });
    askSteward.mockResolvedValue({ reply: "ok", mode: "offline" });

    await POST(jsonRequest("POST", { message: "how am I doing?" }));

    const call = askSteward.mock.calls[0][0];
    expect(call.context).toContain("Income: ₦100,000");
    expect(call.context).toContain("Spend: available");
    expect(call.context).toContain("Accounts (balances the user recorded; these are not net worth)");
    expect(call.context).toContain("GTBank (Bank account): -₦500 NGN");
    expect(call.context).toContain("Facts worked out by FinTrack");
    expect(call.context).toContain("GTBank is below zero"); // a derived fact, with its evidence
    expect(call.context).toContain("Limits of these numbers");
    // the guided (offline) reply gets the same facts
    expect(call.offlineCtx.insightLines.join(" ")).toContain("GTBank is below zero");
    expect(bank.id).toBeTruthy();
  });

  it("never includes another user's accounts or figures", async () => {
    const other = await createUser();
    await testDb.account.create({
      data: { userId: other.id, name: "SecretVault", kind: "asset", type: "savings", openingBalanceMinor: BigInt(999_999_00), openingDate: new Date("2026-01-01T12:00:00Z") },
    });
    await seedTx(other.id, { type: "i", amount: 7_777_777 });
    const user = await createUser();
    signIn(user);
    askSteward.mockResolvedValue({ reply: "ok", mode: "offline" });

    await POST(jsonRequest("POST", { message: "hi" }));

    const context = askSteward.mock.calls[0][0].context as string;
    expect(context).not.toContain("SecretVault");
    expect(context).not.toContain("7,777,777");
    expect(context).toContain("(no accounts yet)");
  });

  it("with no data at all, says so instead of inventing anything", async () => {
    const user = await createUser();
    signIn(user);
    askSteward.mockResolvedValue({ reply: "ok", mode: "offline" });
    await POST(jsonRequest("POST", { message: "hi" }));
    const context = askSteward.mock.calls[0][0].context as string;
    expect(context).toContain("(no plan yet)");
    expect(context).toContain("(nothing recorded yet)");
    expect(context).toContain("nothing stands out right now");
  });
});

describe("the guided (offline) Steward", () => {
  it("answers 'am I on track' with the facts worked out, not generic advice alone", async () => {
    const { offlineAdvisorReply } = await import("@fintrack/domain");
    const reply = offlineAdvisorReply("am I on track?", {
      income: 100_000, expenses: 20_000, net: 80_000, planName: "Plan", bucketLines: ["Spend: left ₦1"], overrideCount: 0,
      insightLines: ["- [attention] GTBank is below zero. A record may be missing. (Recorded balance: −₦500.00)"],
    });
    expect(reply).toContain("What stands out right now");
    expect(reply).toContain("GTBank is below zero");
  });
});

describe("Steward cost and privacy guards", () => {
  it("refuses the 9th message inside a minute, with a polite error and Retry-After", async () => {
    const user = await createUser();
    signIn(user);
    askSteward.mockResolvedValue({ reply: "ok", mode: "offline" });
    for (let i = 0; i < 8; i++) {
      expect((await POST(jsonRequest("POST", { message: `q${i}` }))).status).toBe(200);
    }
    const res = await POST(jsonRequest("POST", { message: "one too many" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect((await res.json()).ok).toBe(false);
    // the refused message never reached the model or the history
    expect(askSteward).toHaveBeenCalledTimes(8);
    expect(await testDb.aiMessage.count({ where: { userId: user.id } })).toBe(16);
  });

  it("DELETE clears only the signed-in user's conversation", async () => {
    const mine = await createUser();
    const other = await createUser();
    await seedConversation(mine.id, 6);
    await seedConversation(other.id, 4);
    signIn(mine);
    const res = await DELETE();
    expect((await res.json()).deleted).toBe(6);
    expect(await testDb.aiMessage.count({ where: { userId: mine.id } })).toBe(0);
    expect(await testDb.aiMessage.count({ where: { userId: other.id } })).toBe(4);
  });

  it("DELETE needs a signed-in user", async () => {
    signIn(null);
    expect((await DELETE()).status).toBe(401);
  });
});
