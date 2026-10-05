/**
 * Helpers shared by the route tests: users, sign-in, seeding and requests.
 *
 * Every test creates its own users and only ever touches their rows, so the
 * tests behave the same on the in-memory fake and on a real database, and can
 * not see each other's data.
 */
import type { Transaction, User } from "@prisma/client";
import { TITHE_FIRST_TEMPLATE, type PlanBucket } from "@fintrack/domain";
import { fakeDb, testDb, usingPostgres } from "./db";

export { testDb, usingPostgres };

const createdUserIds: string[] = [];
let signedInUserId: string | null = null;
let emailCounter = 0;

export async function createUser(data: Partial<User> = {}): Promise<User> {
  emailCounter += 1;
  const user = await testDb.user.create({
    data: {
      email: `t${Date.now()}-${emailCounter}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.test`,
      onboarding: "completed",
      ...data,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

/** Who the mocked session belongs to (null = signed out) */
export function signIn(user: { id: string } | null) {
  signedInUserId = user ? user.id : null;
}

/** What the mocked getSessionUser() returns: a fresh read of the user row */
export async function sessionUser(): Promise<User | null> {
  if (!signedInUserId) return null;
  return testDb.user.findUnique({ where: { id: signedInUserId } });
}

/** Remove everything this test file created (users cascade to their rows) */
export async function cleanup() {
  signedInUserId = null;
  if (fakeDb) {
    fakeDb.__reset();
  } else if (createdUserIds.length) {
    await testDb.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
  }
  createdUserIds.length = 0;
}

export function jsonRequest(method: string, body?: unknown, url = "http://localhost/api") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Route context for /api/…/[id] handlers */
export function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

export function titheFirstBuckets(): PlanBucket[] {
  return TITHE_FIRST_TEMPLATE.plan.buckets.map((b) => ({ ...b }));
}

export async function seedPlan(
  userId: string,
  buckets: PlanBucket[] = titheFirstBuckets(),
  extra: { name?: string; templateId?: string | null } = {}
) {
  return testDb.budgetPlan.create({
    data: {
      userId,
      name: extra.name ?? "Tithe-first waterfall",
      templateId: extra.templateId === undefined ? "tithe_first" : extra.templateId,
      bucketsJson: JSON.stringify(buckets),
    },
  });
}

export async function seedTx(
  userId: string,
  data: {
    type: "i" | "e";
    amount: number;
    date?: Date;
    createdAt?: Date;
    bucketId?: string;
    currency?: string;
    note?: string;
    sourceId?: string;
    overspend?: boolean;
    override?: boolean;
  }
): Promise<Transaction> {
  return testDb.transaction.create({ data: { userId, ...data } });
}

/** A copy of the user's transactions, in a stable order, for before/after checks */
export async function transactionsOf(userId: string) {
  const rows = await testDb.transaction.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return JSON.parse(JSON.stringify(rows)) as Record<string, unknown>[];
}

/** The 15th of a month relative to now (0 = this month, -1 = last month) */
export function midMonth(offset: number, now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + offset, 15, 12, 0, 0);
}

export const HOUR = 60 * 60 * 1000;
