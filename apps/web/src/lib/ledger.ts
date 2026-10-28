import { toMinor } from "@fintrack/domain";
import { prisma } from "./db";

/**
 * Transactions whose exact whole-minor-unit amount is missing or disagrees with
 * the Float amount. It should always be empty: both are written together, and the
 * migration filled the older rows. Used by tests, and the check to run before the
 * arithmetic is switched over to the integer column.
 */
export async function ledgerDrift(userId?: string): Promise<{ id: string; amount: number; amountMinor: bigint | null }[]> {
  const rows = await prisma.transaction.findMany({
    where: userId ? { userId } : {},
    select: { id: true, amount: true, amountMinor: true },
  });
  return rows.filter((r) => r.amountMinor === null || Number(r.amountMinor) !== toMinor(r.amount));
}
