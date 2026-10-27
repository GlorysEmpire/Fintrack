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
import { GET, POST } from "./route";

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
