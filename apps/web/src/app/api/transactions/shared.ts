/**
 * Request shapes and response mapping shared by the transaction routes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import type { TransactionResult } from "@/lib/transactions";

const currency = z.enum(["NGN", "USD", "GBP", "EUR"]);
const amount = z
  .number()
  .finite()
  .positive("Enter an amount above 0.")
  .max(1_000_000_000_000, "That amount is too large.");
const shortText = z.string().max(500, "Keep notes to 500 characters or fewer.");
const id = z.string().max(64);
/** "YYYY-MM-DD"; whether it is a real, allowed day is decided by the domain */
const day = z.string().max(10);

export const createTransactionSchema = z
  .object({
    type: z.enum(["i", "e"]),
    amount,
    currency: currency.default("NGN"),
    bucketId: id.optional().nullable(),
    sourceId: id.optional().nullable(),
    category: id.optional().nullable(),
    note: shortText.optional().nullable(),
    reason: shortText.optional().nullable(),
    date: day.optional().nullable(),
  })
  .strict();

/** Every field optional: only what the user changed is sent. `type` can not change. */
export const updateTransactionSchema = z
  .object({
    amount: amount.optional(),
    currency: currency.optional(),
    bucketId: id.optional().nullable(),
    sourceId: id.optional().nullable(),
    category: id.optional().nullable(),
    note: shortText.optional().nullable(),
    reason: shortText.optional().nullable(),
    date: day.optional().nullable(),
  })
  .strict();

/**
 * 200 saved · 400 not valid · 404 not yours / not found ·
 * 422 refused: the bucket does not hold what was asked for (blocked at zero) ·
 * 423 locked: the edit window has closed.
 */
export function transactionResponse(result: TransactionResult) {
  switch (result.status) {
    case "ok":
      return NextResponse.json({
        ok: true,
        transaction: result.transaction,
        crossBucket: result.crossBucket,
      });
    case "invalid":
      return jsonError(400, result.error, {
        ...(result.crossBucket ? { crossBucket: true } : {}),
      });
    case "blocked":
      return jsonError(422, result.error, {
        blocked: true,
        shortfall: result.shortfall,
      });
    case "locked":
      return jsonError(423, result.error, {
        locked: true,
        editableUntil: result.editableUntil,
      });
    case "not_found":
      return jsonError(404, "Not found");
  }
}
