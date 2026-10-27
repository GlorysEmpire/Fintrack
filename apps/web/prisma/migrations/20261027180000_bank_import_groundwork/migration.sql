-- Read-only bank-data groundwork: bank connections (consent + sync state, no
-- credentials) and imported transactions awaiting review. ADDITIVE ONLY: two new
-- tables, one nullable column on "Account" and one on "Transaction". No existing
-- row is rewritten, and nothing here can move money. It deliberately does not
-- drop the leftover "Transaction"."overspend" column.
--
-- "Transaction"."importId" is unique: it is set in the same write that creates
-- a transaction from an import, so one import can never become two transactions.

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "connectionId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "importId" TEXT;

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "consentGrantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentExpiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "cursor" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "originalAmountMinor" BIGINT,
    "originalCurrency" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "counterparty" TEXT,
    "review" TEXT NOT NULL DEFAULT 'new',
    "transactionId" TEXT,
    "attention" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankConnection_userId_idx" ON "BankConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedTransaction_transactionId_key" ON "ImportedTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "ImportedTransaction_userId_review_idx" ON "ImportedTransaction"("userId", "review");

-- CreateIndex
CREATE INDEX "ImportedTransaction_accountId_idx" ON "ImportedTransaction"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedTransaction_connectionId_externalId_key" ON "ImportedTransaction"("connectionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_connectionId_externalAccountId_key" ON "Account"("connectionId", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_importId_key" ON "Transaction"("importId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransaction" ADD CONSTRAINT "ImportedTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransaction" ADD CONSTRAINT "ImportedTransaction_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransaction" ADD CONSTRAINT "ImportedTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Integrity rules the database enforces itself
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_status_check" CHECK ("status" IN ('active', 'error', 'revoked', 'expired'));
ALTER TABLE "ImportedTransaction" ADD CONSTRAINT "ImportedTransaction_status_check" CHECK ("status" IN ('pending', 'posted', 'reversed'));
ALTER TABLE "ImportedTransaction" ADD CONSTRAINT "ImportedTransaction_review_check" CHECK ("review" IN ('new', 'accepted', 'matched', 'ignored'));
