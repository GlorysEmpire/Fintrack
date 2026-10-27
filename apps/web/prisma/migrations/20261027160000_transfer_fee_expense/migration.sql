-- A transfer fee is a real cost, so it is recorded as an ordinary expense
-- transaction linked to its transfer (and removed with it). ADDITIVE ONLY: one
-- nullable column with its unique index and foreign key. No existing row is
-- rewritten. It deliberately does not drop the leftover Transaction."overspend"
-- column.

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "transferId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transferId_key" ON "Transaction"("transferId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

