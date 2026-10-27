/**
 * The bank routes: who may reach what, and that the cron endpoint is closed
 * without the secret.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { resetMockBank } from "@/lib/bank/mock-provider";
import { cleanup, createUser, jsonRequest, params, seedPlan, seedTx, signIn, testDb } from "@/test/harness";
import { GET as listConnectionsRoute, POST as createConnectionRoute } from "./connections/route";
import { DELETE as disconnectRoute, POST as connectionAction } from "./connections/[id]/route";
import { GET as listImportsRoute } from "./imports/route";
import { POST as importAction } from "./imports/[id]/route";
import { GET as cronGet } from "../public/cron/bank-sync/route";

beforeEach(() => resetMockBank());
afterEach(async () => {
  delete process.env.CRON_SECRET;
  vi.restoreAllMocks();
  resetMockBank();
  await cleanup();
});

const post = (handler: typeof connectionAction, id: string, body: unknown) => handler(jsonRequest("POST", body), params(id));

async function connectedDemo() {
  const user = await createUser();
  signIn(user);
  await seedPlan(user.id);
  await seedTx(user.id, { type: "i", amount: 500_000, date: new Date() });
  const account = await testDb.account.create({
    data: { userId: user.id, name: "GTBank", kind: "asset", type: "bank", openingDate: new Date("2026-01-01T12:00:00Z") },
  });
  const made = await (await createConnectionRoute(jsonRequest("POST", { provider: "mock" }))).json();
  const id = made.connectionId as string;
  const accounts = await (await post(connectionAction, id, { action: "accounts" })).json();
  expect(accounts.accounts[0].externalId).toBe("demo-current");
  expect((await post(connectionAction, id, { action: "link", externalAccountId: "demo-current", accountId: account.id })).status).toBe(200);
  return { user, account, id };
}

describe("bank routes", () => {
  it("need sign-in", async () => {
    signIn(null);
    expect((await listConnectionsRoute()).status).toBe(401);
    expect((await createConnectionRoute(jsonRequest("POST", { provider: "mock" }))).status).toBe(401);
    expect((await listImportsRoute()).status).toBe(401);
    expect((await post(importAction, "x", { action: "ignore" })).status).toBe(401);
  });

  it("an unknown provider can not be connected", async () => {
    const user = await createUser();
    signIn(user);
    expect((await createConnectionRoute(jsonRequest("POST", { provider: "some-bank" }))).status).toBe(400);
    expect(await testDb.bankConnection.count({})).toBe(0);
  });

  it("the whole read-only flow: connect, link, sync, review, accept", async () => {
    const { user, id } = await connectedDemo();
    const synced = await (await post(connectionAction, id, { action: "sync" })).json();
    expect(synced).toMatchObject({ ok: true, imported: 4 });
    expect(await testDb.transaction.count({ where: { userId: user.id, importId: { not: null } } })).toBe(0);

    const queue = (await (await listImportsRoute()).json()).imports as { id: string; amount: number; status: string }[];
    expect(queue).toHaveLength(4);
    const credit = queue.find((q) => q.amount === 250_000)!;
    expect((await post(importAction, credit.id, { action: "accept" })).status).toBe(200);
    expect(await testDb.transaction.count({ where: { userId: user.id, importId: credit.id } })).toBe(1);
    // already dealt with
    expect((await post(importAction, credit.id, { action: "accept" })).status).toBe(200); // idempotent confirmation
    expect(await testDb.transaction.count({ where: { userId: user.id, importId: credit.id } })).toBe(1);
  });

  it("syncing again right away is refused, politely", async () => {
    const { id } = await connectedDemo();
    expect((await post(connectionAction, id, { action: "sync" })).status).toBe(200);
    expect((await post(connectionAction, id, { action: "sync" })).status).toBe(429);
  });

  it("another user's connection and imports are invisible and untouchable", async () => {
    const { id } = await connectedDemo();
    const queue = await testDb.importedTransaction.findMany({ where: {} });
    await post(connectionAction, id, { action: "sync" });
    const imports = await testDb.importedTransaction.findMany({ where: {} });
    expect(queue.length).toBe(0);
    expect(imports.length).toBeGreaterThan(0);

    const intruder = await createUser();
    signIn(intruder);
    expect((await (await listConnectionsRoute()).json()).connections).toEqual([]);
    expect((await (await listImportsRoute()).json()).imports).toEqual([]);
    expect((await post(connectionAction, id, { action: "sync" })).status).toBe(404);
    expect((await post(connectionAction, id, { action: "accounts" })).status).toBe(404);
    expect((await disconnectRoute(jsonRequest("DELETE"), params(id))).status).toBe(404);
    expect((await post(importAction, imports[0].id, { action: "accept" })).status).toBe(404);
    expect((await post(importAction, imports[0].id, { action: "ignore" })).status).toBe(404);
    expect((await testDb.bankConnection.findUnique({ where: { id } }))!.status).toBe("active");
  });

  it("rejects unknown fields and actions", async () => {
    const { id } = await connectedDemo();
    expect((await post(connectionAction, id, { action: "pay", amount: 5 })).status).toBe(400);
    expect((await post(importAction, "x", { action: "accept", amount: 5 })).status).toBe(400);
    expect((await post(importAction, "x", { action: "delete" })).status).toBe(400);
  });

  it("disconnect through the route keeps imported data", async () => {
    const { id } = await connectedDemo();
    await post(connectionAction, id, { action: "sync" });
    expect((await disconnectRoute(jsonRequest("DELETE"), params(id))).status).toBe(200);
    expect((await testDb.bankConnection.findUnique({ where: { id } }))!.status).toBe("revoked");
    expect((await testDb.importedTransaction.findMany({ where: {} })).length).toBe(4);
    expect((await post(connectionAction, id, { action: "sync" })).status).toBe(400);
  });
});

describe("the bank-sync cron endpoint", () => {
  const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/public/cron/bank-sync", { headers });

  it("is closed with no secret configured, a wrong secret, or none given", async () => {
    expect((await cronGet(req())).status).toBe(401);
    process.env.CRON_SECRET = "s3cret-value";
    expect((await cronGet(req())).status).toBe(401);
    expect((await cronGet(req({ authorization: "Bearer nope" }))).status).toBe(401);
  });

  it("runs with the secret and reports counts only", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "s3cret-value";
    const { id } = await connectedDemo();
    const res = await cronGet(req({ authorization: "Bearer s3cret-value" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, connections: 1, synced: 1, imported: 4 });
    expect(JSON.stringify(body)).not.toMatch(new RegExp(id));
  });
});
