-- AlterTable: which scheduled occurrence a recurring transaction is, so the
-- same occurrence can never be recorded twice. Additive only: existing rows get
-- NULL (they are not recurring occurrences we can identify) and nothing is rewritten.
ALTER TABLE "Transaction" ADD COLUMN     "occurrenceDate" TIMESTAMP(3);

-- AlterTable: run status for each recurring rule (observability)
ALTER TABLE "RecurringRule" ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT;

-- CreateIndex: one transaction per (rule, occurrence). NULLs never collide in
-- PostgreSQL, so all existing and non-recurring transactions are unaffected.
CREATE UNIQUE INDEX "Transaction_recurringRuleId_occurrenceDate_key" ON "Transaction"("recurringRuleId", "occurrenceDate");
