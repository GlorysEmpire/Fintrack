/**
 * The database the tests talk to.
 *
 * Default: an in-memory fake (fake-db.ts). No database is touched at all.
 *
 * With TEST_DATABASE_URL set, the SAME tests run against a real PostgreSQL
 * database instead. Two guards make it impossible to aim this at real data:
 *   - the host must be this machine (localhost / 127.0.0.1 / ::1)
 *   - the database name must contain "test"
 * The app's own DATABASE_URL is never read here.
 */
import { PrismaClient } from "@prisma/client";
import { FakeDb } from "./fake-db";

function assertThrowawayDatabase(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const name = url.pathname.replace(/^\//, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      `Refusing to run tests against "${host}". TEST_DATABASE_URL must point at this machine.`
    );
  }
  if (!name.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to run tests against database "${name}". Its name must contain "test".`
    );
  }
  return raw;
}

const postgresUrl = process.env.TEST_DATABASE_URL?.trim();

export const usingPostgres = Boolean(postgresUrl);

export const fakeDb = postgresUrl ? null : new FakeDb();

/** Typed as the real client so tests are checked against the real API */
export const testDb: PrismaClient = postgresUrl
  ? new PrismaClient({ datasourceUrl: assertThrowawayDatabase(postgresUrl) })
  : (fakeDb as unknown as PrismaClient);
