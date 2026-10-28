-- Approved bucket exceptions: when an expense needs more than its bucket holds,
-- the user may fund the shortfall from another bucket, with a reason. ADDITIVE
-- ONLY: one new table. No existing row is rewritten. A reallocation is tied
-- one-to-one to the expense it funded, and is deleted with it, so a bucket can
-- never be topped up without a real expense behind it. It deliberately does not
-- drop the leftover "Transaction"."overspend" column.

-- CreateTable
CREATE TABLE "Reallocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "fromBucketId" TEXT NOT NULL,
    "toBucketId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "fromProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reallocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reallocation_transactionId_key" ON "Reallocation"("transactionId");

-- CreateIndex
CREATE INDEX "Reallocation_userId_date_idx" ON "Reallocation"("userId", "date");

-- AddForeignKey
ALTER TABLE "Reallocation" ADD CONSTRAINT "Reallocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reallocation" ADD CONSTRAINT "Reallocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules the database enforces itself
ALTER TABLE "Reallocation" ADD CONSTRAINT "Reallocation_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "Reallocation" ADD CONSTRAINT "Reallocation_different_buckets_check" CHECK ("fromBucketId" <> "toBucketId");
ALTER TABLE "Reallocation" ADD CONSTRAINT "Reallocation_reason_check" CHECK (length(btrim("reason")) > 0);
