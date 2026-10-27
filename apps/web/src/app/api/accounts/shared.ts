/**
 * Request shapes and response mapping for the account and transfer routes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import type { AccountResult } from "@/lib/accounts";
import type { TransferResult } from "@/lib/transfers";

const currency = z.enum(["NGN", "USD", "GBP", "EUR"]);
const id = z.string().max(64);
const day = z.string().max(10);
const money = z.number().finite().max(1_000_000_000_000, "That amount is too large.");
const positive = money.positive("Enter an amount above 0.");
const text = (n: number) => z.string().max(n);

export const createAccountSchema = z
  .object({
    name: text(60),
    type: text(30),
    institution: text(80).optional().nullable(),
    currency: currency.default("NGN"),
    /** For a card or loan: the amount currently owed, as a positive number */
    openingBalance: money.default(0),
    openingDate: day.optional().nullable(),
  })
  .strict();

export const updateAccountSchema = z
  .object({
    name: text(60).optional(),
    institution: text(80).optional().nullable(),
    status: z.enum(["active", "archived"]).optional(),
    openingBalance: money.optional(),
    openingDate: day.optional().nullable(),
  })
  .strict();

export const adjustSchema = z
  .object({
    /** What the account really holds (for a debt: what is really owed) */
    actualBalance: money,
    note: text(500).optional().nullable(),
  })
  .strict();

export const assignSchema = z.object({ confirm: z.literal(true) }).strict();

export const createTransferSchema = z
  .object({
    fromAccountId: id,
    toAccountId: id,
    amount: positive,
    toAmount: positive.optional().nullable(),
    fee: money.min(0).optional().nullable(),
    feeBucketId: id.optional().nullable(),
    exchangeRate: positive.optional().nullable(),
    date: day.optional().nullable(),
    note: text(500).optional().nullable(),
    reference: text(120).optional().nullable(),
  })
  .strict();

export function accountResponse(result: AccountResult) {
  switch (result.status) {
    case "ok":
      return NextResponse.json({ ok: true, account: result.account });
    case "invalid":
      return jsonError(400, result.error);
    case "not_found":
      return jsonError(404, "Not found");
  }
}

/** 200 saved · 400 not valid · 404 not yours / not found · 423 edit window closed */
export function transferResponse(result: TransferResult | { status: "deleted" }) {
  switch (result.status) {
    case "blocked":
      return jsonError(422, result.error, { blocked: true, shortfall: result.shortfall });
    case "ok":
      return NextResponse.json({ ok: true, transfer: result.transfer });
    case "deleted":
      return NextResponse.json({ ok: true });
    case "invalid":
      return jsonError(400, result.error);
    case "locked":
      return jsonError(423, result.error, { locked: true, editableUntil: result.editableUntil });
    case "not_found":
      return jsonError(404, "Not found");
  }
}
