/** Setting the display name: signed-in only, trimmed, cleared by empty, and only your own record. */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { cleanup, createUser, jsonRequest, signIn, testDb } from "@/test/harness";
import { PATCH } from "./route";

afterEach(cleanup);
const patch = (body: unknown) => PATCH(jsonRequest("PATCH", body));

describe("PATCH /api/settings/profile", () => {
  it("refuses a signed-out request", async () => {
    signIn(null);
    expect((await patch({ name: "Glory" })).status).toBe(401);
  });

  it("saves a trimmed name, and an empty one clears it", async () => {
    const user = await createUser();
    signIn(user);
    expect((await patch({ name: "  Glory  " })).status).toBe(200);
    expect((await testDb.user.findUnique({ where: { id: user.id } }))?.name).toBe("Glory");
    expect((await patch({ name: "   " })).status).toBe(200);
    expect((await testDb.user.findUnique({ where: { id: user.id } }))?.name).toBeNull();
  });

  it("refuses a name that is far too long, and leaves other users alone", async () => {
    const me = await createUser();
    const other = await createUser({ name: "Someone" });
    signIn(me);
    expect((await patch({ name: "x".repeat(61) })).status).toBe(400);
    await patch({ name: "Me" });
    expect((await testDb.user.findUnique({ where: { id: other.id } }))?.name).toBe("Someone");
  });
});
