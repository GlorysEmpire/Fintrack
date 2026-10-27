-- Accounts, transfers and balance adjustments. ADDITIVE ONLY: three new tables,
-- one nullable column on Transaction and one on RecurringRule. No existing row
-- is rewritten: every existing transaction keeps accountId NULL ("not assigned
-- to an account"); no account, balance or movement is invented for anyone.
--
-- Deliberately NOT included: dropping the leftover Transaction."overspend"
-- column (see the note in schema.prisma). It stays until the live app no longer
-- selects it.

-- AlterTable
ALTER TABLE "RecurringRule" ADD COLUMN     "accountId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "accountId" TEXT;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "institution" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "openingBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "openingDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "provider" TEXT,
    "externalAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "fromAmountMinor" BIGINT NOT NULL,
    "toAmountMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_name_key" ON "Account"("userId", "name");

-- CreateIndex
CREATE INDEX "Transfer_userId_date_idx" ON "Transfer"("userId", "date");

-- CreateIndex
CREATE INDEX "Transfer_fromAccountId_idx" ON "Transfer"("fromAccountId");

-- CreateIndex
CREATE INDEX "Transfer_toAccountId_idx" ON "Transfer"("toAccountId");

-- CreateIndex
CREATE INDEX "AccountAdjustment_accountId_idx" ON "AccountAdjustment"("accountId");

-- CreateIndex
CREATE INDEX "AccountAdjustment_userId_idx" ON "AccountAdjustment"("userId");

-- CreateIndex
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Integrity rules the database enforces itself (Prisma has no syntax for CHECK)
ALTER TABLE "Account" ADD CONSTRAINT "Account_kind_check" CHECK ("kind" IN ('asset', 'liability'));
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_different_accounts_check" CHECK ("fromAccountId" <> "toAccountId");
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_amounts_check" CHECK ("fromAmountMinor" > 0 AND "toAmountMinor" > 0 AND "feeMinor" >= 0);

