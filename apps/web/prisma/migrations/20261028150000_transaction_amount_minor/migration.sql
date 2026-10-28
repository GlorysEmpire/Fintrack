-- Money in whole minor units, step 1 of 3 (ADDITIVE ONLY).
-- Adds an exact integer copy of every transaction amount next to the existing
-- Float and fills it in for the rows already there. Nothing existing is changed
-- or dropped: "amount" stays exactly as it is and the app still reads it. New
-- and edited transactions write both. A later step switches the arithmetic to
-- the integer column; the last step retires the Float.

ALTER TABLE "Transaction" ADD COLUMN "amountMinor" BIGINT;

UPDATE "Transaction" SET "amountMinor" = ROUND(("amount" * 100)::numeric)::BIGINT;
