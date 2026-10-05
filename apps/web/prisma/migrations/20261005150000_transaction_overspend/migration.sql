-- AlterTable: mark an expense the user confirmed even though it was more than
-- the bucket held. Additive only: existing rows default to false, no data is changed.
ALTER TABLE "Transaction" ADD COLUMN     "overspend" BOOLEAN NOT NULL DEFAULT false;
