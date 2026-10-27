/**
 * The recurring cron endpoint: closed unless the secret matches, and closed
 * when no secret is configured at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));

import { cleanup, createUser, testDb } from "@/test/harness";
import { GET, POST } from "./route";

const SECRET = "test-cron-secret-value";
const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/public/cron/recurring", { headers });

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(async () => {
  delete process.env.CRON_SECRET;
  vi.restoreAllMocks();
  await cleanup();
});

describe("cron authentication", () => {
  it("refuses everything when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request({ authorization: "Bearer undefined" }))).status).toBe(401);
    expect((await GET(request({ authorization: "Bearer " }))).status).toBe(401);
    expect((await POST(request({ "x-cron-secret": "" }))).status).toBe(401);
  });

  it("refuses a wrong or missing secret", async () => {
    process.env.CRON_SECRET = SECRET;
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request({ authorization: "Bearer wrong" }))).status).toBe(401);
    expect((await GET(request({ "x-cron-secret": SECRET + "x" }))).status).toBe(401);
  });

  it("does no work for a refused request", async () => {
    const user = await createUser();
    await testDb.recurringRule.create({
      data: { userId: user.id, type: "i", amount: 5, cadence: "daily", nextRunAt: new Date("2020-01-01T12:00:00Z") },
    });
    process.env.CRON_SECRET = SECRET;
    await GET(request({ authorization: "Bearer wrong" }));
    expect(await testDb.transaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it("runs with the right secret, by either header, and reports counts only", async () => {
    process.env.CRON_SECRET = SECRET;
    const user = await createUser();
    await testDb.recurringRule.create({
      data: { userId: user.id, type: "i", amount: 5, cadence: "daily", nextRunAt: new Date() },
    });

    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, rulesChecked: 1, created: 1, failedRules: 0 });
    expect(Object.keys(body)).not.toContain("outcomes");

    const viaHeader = await POST(request({ "x-cron-secret": SECRET }));
    expect(viaHeader.status).toBe(200);
    expect((await viaHeader.json()).created).toBe(0); // same occurrences: nothing new
  });
});
