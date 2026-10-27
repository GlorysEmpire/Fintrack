/**
 * Run `work` while holding a per-user lock, so two requests for the same user
 * take turns instead of overlapping.
 *
 * Why: "is there enough in this bucket?" is a read followed by a write. Two
 * expenses sent at the same moment can both read the same balance, both pass,
 * and together overspend a bucket the policy says is blocked at zero. The lock
 * makes the second request wait until the first has been saved, so it checks
 * against the real, updated balance.
 *
 * How: a PostgreSQL advisory lock taken inside a short transaction
 * (pg_advisory_xact_lock). It is released automatically when the transaction
 * ends, even if `work` throws or the connection drops. The work itself runs
 * normally, outside that transaction, so its writes are committed before the
 * next waiting request is let in. It only ever blocks other work for the SAME
 * user.
 */
import { prisma } from "./db";

const LOCK_TIMEOUT_MS = 15_000;

export async function withUserLock<T>(
  userId: string,
  work: () => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      return work();
    },
    { maxWait: LOCK_TIMEOUT_MS, timeout: LOCK_TIMEOUT_MS }
  );
}
